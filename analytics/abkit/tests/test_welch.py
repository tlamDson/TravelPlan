import math

import numpy as np
import pytest
from scipy import stats

from abkit.stats import welch_ttest

CONTROL = np.array([1.0, 2.0, 3.0, 4.0])
TREATMENT = np.array([2.0, 4.0, 6.0, 8.0])
# By hand: var_c = 5/3, var_t = 20/3, se^2 = 5/12 + 5/3 = 25/12, t = 2.5 / sqrt(25/12) = sqrt(3),
# Welch-Satterthwaite df = (25/12)^2 / ((5/12)^2 / 3 + (5/3)^2 / 3) = 75/17.
SE = math.sqrt(25 / 12)
DF = 75 / 17


def test_two_sided_matches_the_hand_computed_welch_formula() -> None:
    res = welch_ttest(CONTROL, TREATMENT, alpha=0.05)
    assert res.estimate == pytest.approx(2.5, rel=1e-12)
    assert res.se == pytest.approx(SE, rel=1e-12)
    assert res.statistic == pytest.approx(math.sqrt(3), rel=1e-12)
    assert res.df == pytest.approx(DF, rel=1e-12)
    assert res.p_value == pytest.approx(2 * stats.t.sf(math.sqrt(3), DF), rel=1e-12)
    half = stats.t.ppf(0.975, DF) * SE
    assert res.ci_low == pytest.approx(2.5 - half, rel=1e-12)
    assert res.ci_high == pytest.approx(2.5 + half, rel=1e-12)
    assert res.alternative == "two-sided"
    assert res.decision == "fail_to_reject"


def test_one_sided_p_values_split_the_two_sided_one() -> None:
    two = welch_ttest(CONTROL, TREATMENT)
    greater = welch_ttest(CONTROL, TREATMENT, alternative="greater")
    less = welch_ttest(CONTROL, TREATMENT, alternative="less")
    assert greater.p_value == pytest.approx(two.p_value / 2, rel=1e-12)
    assert greater.p_value + less.p_value == pytest.approx(1.0, rel=1e-12)
    assert greater.ci_high == math.inf and greater.ci_low < greater.estimate
    assert less.ci_low == -math.inf and less.ci_high > less.estimate
    assert greater.ci_low == pytest.approx(2.5 - stats.t.ppf(0.95, DF) * SE, rel=1e-12)


def test_swapping_groups_negates_the_estimate_and_keeps_the_p_value() -> None:
    a = welch_ttest(CONTROL, TREATMENT)
    b = welch_ttest(TREATMENT, CONTROL)
    assert b.estimate == pytest.approx(-a.estimate)
    assert b.statistic == pytest.approx(-a.statistic)
    assert b.p_value == pytest.approx(a.p_value)
    assert (b.ci_low, b.ci_high) == pytest.approx((-a.ci_high, -a.ci_low))


def test_decision_rejects_when_p_is_below_alpha_and_ci_then_excludes_zero() -> None:
    rng = np.random.default_rng(7)
    control, treatment = rng.normal(0, 1, 400), rng.normal(0.5, 1, 400)
    res = welch_ttest(control, treatment, alpha=0.05)
    assert res.p_value < 0.05
    assert res.decision == "reject_null"
    assert res.ci_low > 0
    loose = welch_ttest(CONTROL, TREATMENT, alpha=0.2)
    assert loose.p_value < 0.2 and loose.decision == "reject_null"


def test_accepts_lists_as_input() -> None:
    assert welch_ttest([1, 2, 3, 4], [2, 4, 6, 8]).estimate == pytest.approx(2.5)


@pytest.mark.parametrize(
    ("control", "treatment", "kwargs", "match"),
    [
        ([1.0], [1.0, 2.0], {}, "at least 2"),
        ([1.0, 1.0], [2.0, 2.0], {}, "variance"),
        ([1.0, math.nan], [1.0, 2.0], {}, "finite"),
        ([1.0, 2.0], [1.0, 2.0], {"alpha": 0.0}, "alpha"),
        ([1.0, 2.0], [1.0, 2.0], {"alpha": 1.0}, "alpha"),
        ([1.0, 2.0], [1.0, 2.0], {"alternative": "bigger"}, "alternative"),
        ([[1.0, 2.0]], [1.0, 2.0], {}, "1-D"),
    ],
)
def test_rejects_bad_input(control, treatment, kwargs, match) -> None:
    with pytest.raises(ValueError, match=match):
        welch_ttest(control, treatment, **kwargs)
