"""Welch's t-test for a difference in means with unequal variances."""

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
class WelchResult:
    """``estimate`` is mean(treatment) - mean(control)."""

    estimate: float
    se: float
    statistic: float
    df: float
    p_value: float
    ci_low: float
    ci_high: float
    alpha: float
    alternative: str

    @property
    def decision(self) -> str:
        return significance(self.p_value, self.alpha)


def welch_ttest(
    control: ArrayLike,
    treatment: ArrayLike,
    alpha: float = 0.05,
    alternative: str = "two-sided",
) -> WelchResult:
    """t = (mean_t - mean_c) / sqrt(s_t²/n_t + s_c²/n_c), Welch-Satterthwaite df."""
    alpha, alternative = check_alpha(alpha), check_alternative(alternative)
    c, t = as_sample("control", control), as_sample("treatment", treatment)
    vc, vt = c.var(ddof=1) / c.size, t.var(ddof=1) / t.size
    if vc + vt == 0:
        raise ValueError("both groups have zero variance; the t statistic is undefined")
    estimate = float(t.mean() - c.mean())
    se = math.sqrt(vc + vt)
    df = float((vc + vt) ** 2 / (vc**2 / (c.size - 1) + vt**2 / (t.size - 1)))
    statistic = estimate / se
    dist = stats.t(df)
    ci_low, ci_high = interval(estimate, se, dist, alpha, alternative)
    return WelchResult(
        estimate=estimate,
        se=se,
        statistic=statistic,
        df=df,
        p_value=p_value(statistic, dist, alternative),
        ci_low=ci_low,
        ci_high=ci_high,
        alpha=alpha,
        alternative=alternative,
    )
