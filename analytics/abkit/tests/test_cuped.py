import math

import numpy as np
import pytest
from scipy import stats

from abkit.stats import cuped, cuped_sample_size, sample_size_multiplier, welch_ttest


def _seeded(rho: float, n: int = 2000, lift: float = 0.3, seed: int = 5):
    rng = np.random.default_rng(seed)
    x_c, x_t = rng.normal(10, 2, n), rng.normal(10, 2, n)
    noise = math.sqrt(1 - rho**2) * 2
    y_c = 10 + rho * (x_c - 10) + rng.normal(0, noise, n)
    y_t = 10 + lift + rho * (x_t - 10) + rng.normal(0, noise, n)
    return y_c, x_c, y_t, x_t


def _by_formula(y_c, x_c, y_t, x_t):
    """Deng et al. (2013) written out independently of the engine."""
    y, x = np.concatenate([y_c, y_t]), np.concatenate([x_c, x_t])
    xd = x - x.mean()
    theta = float(np.sum(xd * (y - y.mean())) / np.sum(xd * xd))
    adj_c = y_c - theta * (x_c - x.mean())
    adj_t = y_t - theta * (x_t - x.mean())
    r = float(np.corrcoef(y, x)[0, 1])
    return theta, r * r, adj_c, adj_t


def test_matches_the_deng_formula_then_welch_on_the_adjusted_values() -> None:
    y_c, x_c, y_t, x_t = _seeded(rho=0.7)
    res = cuped(y_c, x_c, y_t, x_t, alpha=0.05)
    theta, r2, adj_c, adj_t = _by_formula(y_c, x_c, y_t, x_t)
    welch = welch_ttest(adj_c, adj_t, alpha=0.05)
    assert res.theta == pytest.approx(theta, rel=1e-12)
    assert res.variance_reduction == pytest.approx(r2, rel=1e-10)
    for key in ("estimate", "se", "statistic", "df", "p_value", "ci_low", "ci_high"):
        assert getattr(res, key) == pytest.approx(getattr(welch, key), rel=1e-12), key
    assert res.decision == welch.decision == "reject_null"
    assert res.alpha == 0.05 and res.alternative == "two-sided"


def test_reports_the_unadjusted_comparison_alongside() -> None:
    y_c, x_c, y_t, x_t = _seeded(rho=0.7)
    res = cuped(y_c, x_c, y_t, x_t)
    naive = welch_ttest(y_c, y_t)
    assert (res.n_control, res.n_treatment) == (2000, 2000)
    assert res.mean_control == pytest.approx(y_c.mean(), rel=1e-12)
    assert res.mean_treatment == pytest.approx(y_t.mean(), rel=1e-12)
    assert res.naive_estimate == pytest.approx(naive.estimate, rel=1e-12)
    assert res.naive_se == pytest.approx(naive.se, rel=1e-12)
    # The adjustment shifts the estimate by theta times the covariate imbalance, nothing else.
    shift = res.theta * (x_t.mean() - x_c.mean())
    assert res.estimate == pytest.approx(res.naive_estimate - shift, rel=1e-12)


def test_sample_size_multiplier_is_one_over_one_minus_r_squared() -> None:
    res = cuped(*_seeded(rho=0.8))
    assert res.variance_reduction == pytest.approx(0.64, abs=0.03)
    assert res.sample_size_multiplier == pytest.approx(1 / (1 - res.variance_reduction), rel=1e-12)
    # The variance of the adjusted estimate shrinks by (1 - R^2), up to the group imbalance.
    assert (res.se / res.naive_se) ** 2 == pytest.approx(1 - res.variance_reduction, rel=0.02)


def test_an_unrelated_covariate_changes_almost_nothing() -> None:
    rng = np.random.default_rng(9)
    y_c, y_t = rng.normal(0, 1, 3000), rng.normal(0.1, 1, 3000)
    x_c, x_t = rng.normal(0, 1, 3000), rng.normal(0, 1, 3000)
    res = cuped(y_c, x_c, y_t, x_t)
    assert 0 <= res.variance_reduction < 0.005
    assert res.sample_size_multiplier == pytest.approx(1.0, abs=0.005)
    assert res.estimate == pytest.approx(res.naive_estimate, abs=0.01)


def test_one_sided_alternatives_follow_welch() -> None:
    y_c, x_c, y_t, x_t = _seeded(rho=0.5, lift=0.05)
    two, greater = cuped(y_c, x_c, y_t, x_t), cuped(y_c, x_c, y_t, x_t, alternative="greater")
    assert greater.p_value == pytest.approx(two.p_value / 2, rel=1e-12)
    assert greater.ci_high == math.inf
    half = stats.t.ppf(0.95, greater.df) * greater.se
    assert greater.ci_low == pytest.approx(greater.estimate - half, rel=1e-12)


def test_cuped_sample_size_scales_by_one_minus_r_squared() -> None:
    assert cuped_sample_size(1000, 0.36) == pytest.approx(640.0)
    assert cuped_sample_size(1000, 0.0) == pytest.approx(1000.0)
    assert sample_size_multiplier(0.36) == pytest.approx(1 / 0.64)
    assert sample_size_multiplier(0.0) == 1.0


@pytest.mark.parametrize("r2", [-0.1, 1.0, 1.5, math.nan])
def test_multiplier_rejects_impossible_variance_reductions(r2: float) -> None:
    with pytest.raises(ValueError, match="variance_reduction"):
        sample_size_multiplier(r2)
    with pytest.raises(ValueError, match="variance_reduction"):
        cuped_sample_size(100, r2)


def test_cuped_sample_size_rejects_a_non_positive_sample() -> None:
    with pytest.raises(ValueError, match="nobs"):
        cuped_sample_size(0, 0.5)


@pytest.mark.parametrize(
    ("args", "kwargs", "match"),
    [
        (([1.0, 2.0], [3.0, 3.0], [2.0, 4.0], [3.0, 3.0]), {}, "covariate"),
        (([1.0, 2.0], [1.0], [2.0, 4.0], [1.0, 2.0]), {}, "same length"),
        (([1.0, 2.0], [1.0, 2.0], [2.0, 4.0], [1.0, 2.0, 3.0]), {}, "same length"),
        (([1.0, math.nan], [1.0, 2.0], [2.0, 4.0], [1.0, 2.0]), {}, "finite"),
        (([1.0], [1.0], [2.0, 4.0], [1.0, 2.0]), {}, "at least 2"),
        (([1.0, 1.0], [1.0, 2.0], [1.0, 1.0], [3.0, 4.0]), {}, "outcome"),
        (([1.0, 2.0], [1.0, 3.0], [2.0, 4.0], [1.0, 2.0]), {"alpha": 1.0}, "alpha"),
        (([1.0, 2.0], [1.0, 3.0], [2.0, 4.0], [1.0, 2.0]), {"alternative": "up"}, "alternative"),
    ],
)
def test_rejects_bad_input(args, kwargs, match) -> None:
    with pytest.raises(ValueError, match=match):
        cuped(*args, **kwargs)
