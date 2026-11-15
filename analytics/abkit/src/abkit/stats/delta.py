"""Delta method for a ratio metric (e.g. saves per session) randomised by user.

Deng, Knoblich & Lu, "Applying the Delta Method in Metric Analytics", KDD 2018:
per group R = mean(y) / mean(x) and
Var(R) ≈ (var_y - 2 R cov_xy + R² var_x) / (n mean_x²), then a z-test on R_t - R_c.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from numpy.typing import ArrayLike
from scipy import stats

from abkit.stats._common import (
    as_sample,
    check_alpha,
    check_alternative,
    interval,
    p_value,
    significance,
)


@dataclass(frozen=True)
class DeltaResult:
    """``estimate`` is ratio_treatment - ratio_control."""

    ratio_control: float
    ratio_treatment: float
    estimate: float
    se: float
    statistic: float
    p_value: float
    ci_low: float
    ci_high: float
    alpha: float
    alternative: str

    @property
    def decision(self) -> str:
        return significance(self.p_value, self.alpha)


def _ratio_and_variance(group: str, numerator: ArrayLike, denominator: ArrayLike):
    y = as_sample(f"{group} numerator", numerator)
    x = as_sample(f"{group} denominator", denominator)
    if y.size != x.size:
        raise ValueError(f"{group} numerator and denominator must have the same length")
    mean_x = x.mean()
    if mean_x == 0:
        raise ValueError(f"{group} denominator has mean 0; the ratio is undefined")
    ratio = y.mean() / mean_x
    dy, dx = y - y.mean(), x - mean_x
    var_y, var_x = dy @ dy / (y.size - 1), dx @ dx / (y.size - 1)
    cov = dy @ dx / (y.size - 1)
    variance = (var_y - 2 * ratio * cov + ratio**2 * var_x) / (y.size * mean_x**2)
    return float(ratio), float(max(variance, 0.0))


def delta_ratio(
    control_numerator: ArrayLike,
    control_denominator: ArrayLike,
    treatment_numerator: ArrayLike,
    treatment_denominator: ArrayLike,
    alpha: float = 0.05,
    alternative: str = "two-sided",
) -> DeltaResult:
    """One row per user in each array; numerator and denominator rows pair up."""
    alpha, alternative = check_alpha(alpha), check_alternative(alternative)
    r_c, v_c = _ratio_and_variance("control", control_numerator, control_denominator)
    r_t, v_t = _ratio_and_variance("treatment", treatment_numerator, treatment_denominator)
    if v_c + v_t == 0:
        raise ValueError("the ratio has zero variance in both groups; the z statistic is undefined")
    estimate, se = r_t - r_c, math.sqrt(v_c + v_t)
    statistic = estimate / se
    dist = stats.norm()
    ci_low, ci_high = interval(estimate, se, dist, alpha, alternative)
    return DeltaResult(
        ratio_control=r_c,
        ratio_treatment=r_t,
        estimate=estimate,
        se=se,
        statistic=statistic,
        p_value=p_value(statistic, dist, alternative),
        ci_low=ci_low,
        ci_high=ci_high,
        alpha=alpha,
        alternative=alternative,
    )
