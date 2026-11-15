import math

import numpy as np
import pytest
from scipy import stats

from abkit.stats import delta_ratio, welch_ttest


def test_matches_a_hand_computed_delta_method_variance() -> None:
    # Control y=[1,3], x=[1,2]: R = 4/3, var_y = 2, var_x = 1/2, cov = 1,
    #   Var(R) = (2 - 2(4/3)(1) + (16/9)(1/2)) / (2 * 1.5^2) = 4/81.
    # Treatment y=[2,4], x=[1,1]: R = 3, Var(R) = 2 / 2 = 1.
    res = delta_ratio([1, 3], [1, 2], [2, 4], [1, 1], alpha=0.05)
    se = math.sqrt(4 / 81 + 1)
    assert res.ratio_control == pytest.approx(4 / 3, rel=1e-12)
    assert res.ratio_treatment == pytest.approx(3.0, rel=1e-12)
    assert res.estimate == pytest.approx(5 / 3, rel=1e-12)
    assert res.se == pytest.approx(se, rel=1e-12)
    assert res.statistic == pytest.approx((5 / 3) / se, rel=1e-12)
    assert res.p_value == pytest.approx(2 * stats.norm.sf((5 / 3) / se), rel=1e-12)
    half = stats.norm.ppf(0.975) * se
    assert (res.ci_low, res.ci_high) == pytest.approx((5 / 3 - half, 5 / 3 + half), rel=1e-12)
    assert res.decision == "fail_to_reject"


def test_unit_denominators_reduce_to_a_difference_in_means() -> None:
    rng = np.random.default_rng(3)
    y_c, y_t = rng.normal(1.0, 1.0, 300), rng.normal(1.3, 1.5, 200)
    res = delta_ratio(y_c, np.ones(300), y_t, np.ones(200))
    welch = welch_ttest(y_c, y_t)
    assert res.estimate == pytest.approx(welch.estimate, rel=1e-12)
    assert res.se == pytest.approx(welch.se, rel=1e-12)
    assert res.statistic == pytest.approx(welch.statistic, rel=1e-12)
    assert res.decision == "reject_null"


def test_scaling_every_denominator_scales_ratios_but_not_the_z_statistic() -> None:
    rng = np.random.default_rng(5)
    x_c, x_t = rng.integers(1, 9, 500).astype(float), rng.integers(1, 9, 500).astype(float)
    y_c, y_t = rng.binomial(x_c.astype(int), 0.1), rng.binomial(x_t.astype(int), 0.12)
    base = delta_ratio(y_c, x_c, y_t, x_t)
    scaled = delta_ratio(y_c, 4 * x_c, y_t, 4 * x_t)
    assert scaled.ratio_control == pytest.approx(base.ratio_control / 4, rel=1e-12)
    assert scaled.estimate == pytest.approx(base.estimate / 4, rel=1e-12)
    assert scaled.statistic == pytest.approx(base.statistic, rel=1e-12)
    assert scaled.p_value == pytest.approx(base.p_value, rel=1e-12)


def test_one_sided_alternatives() -> None:
    args = ([1, 3], [1, 2], [2, 4], [1, 1])
    two = delta_ratio(*args)
    greater = delta_ratio(*args, alternative="greater")
    less = delta_ratio(*args, alternative="less")
    assert greater.p_value == pytest.approx(two.p_value / 2, rel=1e-12)
    assert greater.p_value + less.p_value == pytest.approx(1.0, rel=1e-12)
    assert greater.ci_high == math.inf and less.ci_low == -math.inf


@pytest.mark.parametrize(
    ("args", "kwargs", "match"),
    [
        (([1, 2], [1, 1, 1], [1, 2], [1, 1]), {}, "same length"),
        (([1], [1], [1, 2], [1, 1]), {}, "at least 2"),
        (([1, 2], [0, 0], [1, 2], [1, 1]), {}, "denominator"),
        (([1, 1], [1, 1], [2, 2], [1, 1]), {}, "variance"),
        (([1, math.inf], [1, 1], [1, 2], [1, 1]), {}, "finite"),
        (([1, 2], [1, 1], [1, 2], [1, 1]), {"alpha": 2}, "alpha"),
    ],
)
def test_rejects_bad_input(args, kwargs, match) -> None:
    with pytest.raises(ValueError, match=match):
        delta_ratio(*args, **kwargs)
