"""CUPED variance reduction (Deng, Xu, Kohavi & Walker, WSDM 2013).

The outcome ``y`` is adjusted with a pre-experiment covariate ``x``:
``y_adj = y - theta (x - mean(x))`` with ``theta = cov(y, x) / var(x)``
pooled over both groups, then Welch's t-test runs on ``y_adj``. The variance
of the estimate shrinks by ``1 - R²`` (R² of y on x), so an unadjusted test
needs ``1 / (1 - R²)`` times as many users for the same precision.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike

from abkit.stats._common import as_sample, significance
from abkit.stats.welch import welch_ttest


@dataclass(frozen=True)
class CupedResult:
    """Welch on the adjusted values; ``naive_*`` and the means are on the raw outcome."""

    theta: float
    variance_reduction: float
    sample_size_multiplier: float
    n_control: int
    n_treatment: int
    mean_control: float
    mean_treatment: float
    naive_estimate: float
    naive_se: float
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


def _check_variance_reduction(variance_reduction: float) -> float:
    if not (isinstance(variance_reduction, int | float) and 0 <= variance_reduction < 1):
        raise ValueError(f"variance_reduction must be in [0, 1), got {variance_reduction!r}")
    return float(variance_reduction)


def sample_size_multiplier(variance_reduction: float) -> float:
    """``1 / (1 - R²)``: users an unadjusted test needs per user of a CUPED test."""
    return 1.0 / (1.0 - _check_variance_reduction(variance_reduction))


def cuped_sample_size(nobs_unadjusted: float, variance_reduction: float) -> float:
    """Users CUPED needs to match an unadjusted test of ``nobs_unadjusted`` users."""
    if isinstance(nobs_unadjusted, bool) or not (
        isinstance(nobs_unadjusted, int | float) and nobs_unadjusted > 0
    ):
        raise ValueError(f"nobs_unadjusted must be > 0, got {nobs_unadjusted!r}")
    return float(nobs_unadjusted) * (1.0 - _check_variance_reduction(variance_reduction))


def _paired(name: str, y: ArrayLike, x: ArrayLike) -> tuple[np.ndarray, np.ndarray]:
    y_arr, x_arr = as_sample(f"{name} outcome", y), as_sample(f"{name} covariate", x, min_size=1)
    if y_arr.size != x_arr.size:
        raise ValueError(
            f"{name} outcome and covariate must have the same length, "
            f"got {y_arr.size} and {x_arr.size}"
        )
    return y_arr, x_arr


def cuped(
    y_control: ArrayLike,
    x_control: ArrayLike,
    y_treatment: ArrayLike,
    x_treatment: ArrayLike,
    alpha: float = 0.05,
    alternative: str = "two-sided",
) -> CupedResult:
    """CUPED-adjusted difference in means, treatment minus control."""
    y_c, x_c = _paired("control", y_control, x_control)
    y_t, x_t = _paired("treatment", y_treatment, x_treatment)
    y, x = np.concatenate([y_c, y_t]), np.concatenate([x_c, x_t])
    x_dev, y_dev = x - x.mean(), y - y.mean()
    sxx, syy = float(np.dot(x_dev, x_dev)), float(np.dot(y_dev, y_dev))
    if sxx == 0:
        raise ValueError("the covariate has zero variance; theta is undefined")
    if syy == 0:
        raise ValueError("the outcome has zero variance; there is nothing to test")
    sxy = float(np.dot(x_dev, y_dev))
    theta = sxy / sxx
    # R² of the pooled regression, i.e. 1 - var(y_adj) / var(y); clipped for rounding.
    variance_reduction = max(sxy * sxy / (sxx * syy), 0.0)
    if variance_reduction >= 1:
        raise ValueError("the covariate explains the outcome exactly; nothing is left to test")
    x_mean = x.mean()
    adjusted = welch_ttest(
        y_c - theta * (x_c - x_mean), y_t - theta * (x_t - x_mean), alpha, alternative
    )
    naive = welch_ttest(y_c, y_t, alpha, alternative)
    return CupedResult(
        theta=theta,
        variance_reduction=variance_reduction,
        sample_size_multiplier=1.0 / (1.0 - variance_reduction),
        n_control=int(y_c.size),
        n_treatment=int(y_t.size),
        mean_control=float(y_c.mean()),
        mean_treatment=float(y_t.mean()),
        naive_estimate=naive.estimate,
        naive_se=naive.se,
        estimate=adjusted.estimate,
        se=adjusted.se,
        statistic=adjusted.statistic,
        df=adjusted.df,
        p_value=adjusted.p_value,
        ci_low=adjusted.ci_low,
        ci_high=adjusted.ci_high,
        alpha=adjusted.alpha,
        alternative=adjusted.alternative,
    )
