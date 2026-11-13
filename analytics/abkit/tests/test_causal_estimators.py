"""Naive difference, IPW and AIPW (B2 plan, PR 17).

The hand-checkable anchor: with one binary covariate and saturated nuisance models, IPW and
AIPW both equal the post-stratified difference in means, whose value is computed here by hand.
"""

import math

import numpy as np
import pytest

from abkit import stats
from abkit.causal import aipw, ipw, naive_diff

# Stratum x=0: treated 4, 6 vs control 1, 2, 3.  Stratum x=1: treated 10, 12, 14 vs control 7, 9.
X = np.array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1], dtype=float)
T = np.array([1, 1, 0, 0, 0, 1, 1, 1, 0, 0], dtype=float)
Y = np.array([4, 6, 1, 2, 3, 10, 12, 14, 7, 9], dtype=float)
E = np.where(X == 0, 2 / 5, 3 / 5)  # saturated propensity = treated share of each stratum
MU0 = np.where(X == 0, 2.0, 8.0)  # saturated outcome model = arm mean of each stratum
MU1 = np.where(X == 0, 5.0, 12.0)
# Effect is 3 in stratum 0 and 4 in stratum 1; each stratum holds half the units.
ATE = 0.5 * 3 + 0.5 * 4
# Treated units: 2 in stratum 0, 3 in stratum 1.
ATT = (2 * 3 + 3 * 4) / 5


def test_naive_diff_is_welchs_difference_in_means() -> None:
    result = naive_diff(Y, T)
    welch = stats.welch_ttest(Y[T == 0], Y[T == 1])
    assert result.estimate == pytest.approx(Y[T == 1].mean() - Y[T == 0].mean(), rel=1e-12)
    assert result.se == pytest.approx(welch.se, rel=1e-12)
    assert result.p_value == pytest.approx(welch.p_value, rel=1e-12)
    assert (result.ci_low, result.ci_high) == pytest.approx((welch.ci_low, welch.ci_high))
    assert (result.n_treated, result.n_control) == (5, 5)
    assert result.method == "naive_diff"


def test_naive_diff_pooled_se_is_the_classical_ols_standard_error() -> None:
    y1, y0 = Y[T == 1], Y[T == 0]
    pooled_var = (4 * y1.var(ddof=1) + 4 * y0.var(ddof=1)) / 8
    result = naive_diff(Y, T, se_type="pooled")
    assert result.se == pytest.approx(math.sqrt(pooled_var * (1 / 5 + 1 / 5)), rel=1e-12)
    from scipy import stats as sps

    assert result.p_value == pytest.approx(2 * sps.t(8).sf(result.estimate / result.se))


def test_ipw_with_saturated_propensity_is_the_post_stratified_ate() -> None:
    result = ipw(Y, T, E, estimand="ate")
    assert result.estimate == pytest.approx(ATE, rel=1e-12)
    assert result.estimand == "ate"
    assert result.method == "ipw"


def test_ipw_att_reweights_controls_to_the_treated_strata() -> None:
    assert ipw(Y, T, E, estimand="att").estimate == pytest.approx(ATT, rel=1e-12)


def test_aipw_with_saturated_models_is_the_post_stratified_effect() -> None:
    assert aipw(Y, T, E, MU0, MU1, estimand="ate").estimate == pytest.approx(ATE, rel=1e-12)
    assert aipw(Y, T, E, MU0, estimand="att").estimate == pytest.approx(ATT, rel=1e-12)


def test_ipw_with_constant_propensity_is_the_naive_difference() -> None:
    """A randomized design: Hajek IPW reduces to the difference in means and its plug-in SE."""
    result = ipw(Y, T, np.full(10, 0.5), estimand="ate")
    y1, y0 = Y[T == 1], Y[T == 0]
    assert result.estimate == pytest.approx(y1.mean() - y0.mean(), rel=1e-12)
    assert result.se == pytest.approx(math.sqrt(y1.var() / 5 + y0.var() / 5), rel=1e-12)


def test_intervals_and_p_values_are_normal_based() -> None:
    result = aipw(Y, T, E, MU0, MU1, estimand="ate", alpha=0.1)
    z = 1.6448536269514722
    assert result.ci_low == pytest.approx(result.estimate - z * result.se, rel=1e-9)
    assert result.ci_high == pytest.approx(result.estimate + z * result.se, rel=1e-9)
    assert result.statistic == pytest.approx(result.estimate / result.se)
    assert result.p_value == pytest.approx(math.erfc(abs(result.statistic) / math.sqrt(2)))
    assert result.decision in {"reject_null", "fail_to_reject"}


def _confounded(n: int, seed: int):
    """True ATE 2.0; x raises both treatment odds and the outcome, so naive is biased up."""
    rng = np.random.default_rng(seed)
    x = rng.normal(size=n)
    e = 1 / (1 + np.exp(-(0.2 + 1.2 * x)))
    t = (rng.random(n) < e).astype(float)
    y = 1.0 + 3.0 * x + 2.0 * t + rng.normal(size=n)
    return x, t, y, e


def test_ipw_and_aipw_remove_confounding_that_biases_the_naive_estimate() -> None:
    x, t, y, e = _confounded(20_000, seed=7)
    mu0, mu1 = 1.0 + 3.0 * x, 3.0 + 3.0 * x
    assert naive_diff(y, t).estimate - 2.0 > 2.0
    for result in (ipw(y, t, e), aipw(y, t, e, mu0, mu1)):
        assert abs(result.estimate - 2.0) < 3 * result.se
        assert result.ci_low < 2.0 < result.ci_high


def test_aipw_is_doubly_robust() -> None:
    x, t, y, e = _confounded(20_000, seed=11)
    good_mu0, good_mu1 = 1.0 + 3.0 * x, 3.0 + 3.0 * x
    bad_mu0, bad_mu1 = np.full_like(x, y[t == 0].mean()), np.full_like(x, y[t == 1].mean())
    bad_e = np.full_like(x, t.mean())
    wrong_propensity = aipw(y, t, bad_e, good_mu0, good_mu1)
    wrong_outcome = aipw(y, t, e, bad_mu0, bad_mu1)
    assert abs(wrong_propensity.estimate - 2.0) < 0.05
    assert abs(wrong_outcome.estimate - 2.0) < 4 * wrong_outcome.se
    assert abs(ipw(y, t, bad_e).estimate - 2.0) > 2.0  # IPW alone is not


@pytest.mark.parametrize(
    ("kwargs", "match"),
    [
        ({"treatment": np.array([0, 1, 2, 1.0])}, "0/1"),
        ({"treatment": np.ones(4)}, "both"),
        ({"outcome": np.array([1.0, np.nan, 2.0, 3.0])}, "finite"),
        ({"propensity": np.array([0.5, 1.0, 0.5, 0.5])}, "propensity"),
        ({"propensity": np.array([0.5, 0.5, 0.5])}, "length"),
        ({"estimand": "atc"}, "estimand"),
        ({"alpha": 1.5}, "alpha"),
    ],
)
def test_ipw_rejects_bad_input(kwargs: dict, match: str) -> None:
    args = {
        "outcome": np.array([1.0, 2.0, 3.0, 4.0]),
        "treatment": np.array([0.0, 1.0, 0.0, 1.0]),
        "propensity": np.full(4, 0.5),
        "estimand": "ate",
        "alpha": 0.05,
    }
    args.update(kwargs)
    with pytest.raises(ValueError, match=match):
        ipw(**args)


def test_aipw_ate_needs_the_treated_outcome_model() -> None:
    with pytest.raises(ValueError, match="mu1"):
        aipw(Y, T, E, MU0, estimand="ate")


def test_naive_diff_rejects_an_unknown_se_type() -> None:
    with pytest.raises(ValueError, match="se_type"):
        naive_diff(Y, T, se_type="robust")
