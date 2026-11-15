"""Power, sample size and minimum detectable effect for two-group tests.

``nobs1`` is the control group size and ``ratio = n_treatment / n_control``.
The t-test uses the noncentral t with df = n1 + n2 - 2 and noncentrality
d * sqrt(n1 n2 / (n1 + n2)); proportions use Cohen's h under the normal
approximation. Two-sided power counts both rejection tails. Sample sizes are
not rounded up: round with ``math.ceil`` when planning.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

from scipy import optimize, stats

from abkit.stats._common import check_alpha, check_alternative, check_finite

_MAX_NOBS = 1e12
_MAX_EFFECT = 1e3


@dataclass(frozen=True)
class ProportionSampleSize:
    effect_size: float
    """Cohen's h of p_treatment against p_control."""
    nobs1: float


def _check_ratio(ratio: float) -> float:
    if check_finite("ratio", ratio) <= 0:
        raise ValueError(f"ratio must be > 0, got {ratio!r}")
    return float(ratio)


def _check_power(power: float, alpha: float) -> float:
    if not (isinstance(power, int | float) and alpha < power < 1):
        raise ValueError(f"power must be in (alpha, 1) = ({alpha}, 1), got {power!r}")
    return float(power)


def _check_effect(effect_size: float) -> float:
    if check_finite("effect_size", effect_size) == 0:
        raise ValueError("effect_size must be non-zero to solve for a sample size")
    return float(effect_size)


def _tails(dist, shift: float, alpha: float, alternative: str) -> float:
    """P(reject) when the statistic is ``dist`` shifted by ``shift`` (noncentrality)."""
    tail = alpha / 2 if alternative == "two-sided" else alpha
    power = 0.0
    if alternative in ("two-sided", "greater"):
        power += dist.upper(dist.null.isf(tail), shift)
    if alternative in ("two-sided", "less"):
        power += dist.lower(dist.null.ppf(tail), shift)
    return float(power)


@dataclass(frozen=True)
class _T:
    df: float

    @property
    def null(self):
        return stats.t(self.df)

    def upper(self, crit: float, nc: float) -> float:
        return stats.nct.sf(crit, self.df, nc)

    def lower(self, crit: float, nc: float) -> float:
        return stats.nct.cdf(crit, self.df, nc)


class _Normal:
    null = stats.norm()

    @staticmethod
    def upper(crit: float, shift: float) -> float:
        return stats.norm.sf(crit - shift)

    @staticmethod
    def lower(crit: float, shift: float) -> float:
        return stats.norm.cdf(crit - shift)


def _effective_n(nobs1: float, ratio: float) -> float:
    nobs2 = nobs1 * ratio
    return nobs1 * nobs2 / (nobs1 + nobs2)


def power_ttest_ind(
    effect_size: float,
    nobs1: float,
    alpha: float = 0.05,
    ratio: float = 1.0,
    alternative: str = "two-sided",
) -> float:
    """Power of a two-sample t-test at Cohen's d = ``effect_size``."""
    d = check_finite("effect_size", effect_size)
    alpha, alternative, ratio = (
        check_alpha(alpha),
        check_alternative(alternative),
        _check_ratio(ratio),
    )
    n1 = check_finite("nobs1", nobs1)
    df = n1 * (1 + ratio) - 2
    if df <= 0:
        raise ValueError(f"nobs1 too small: need nobs1 * (1 + ratio) > 2, got nobs1={nobs1!r}")
    return _tails(_T(df), d * math.sqrt(_effective_n(n1, ratio)), alpha, alternative)


def _normal_power(h: float, nobs1: float, alpha: float, ratio: float, alternative: str) -> float:
    if check_finite("nobs1", nobs1) <= 0:
        raise ValueError(f"nobs1 must be > 0, got {nobs1!r}")
    return _tails(_Normal, h * math.sqrt(_effective_n(nobs1, ratio)), alpha, alternative)


def _root(f: Callable[[float], float], lo: float, hi: float, limit: float, what: str) -> float:
    """Root of an increasing ``f`` in (lo, ∞), growing ``hi`` until it brackets one."""
    if f(lo) >= 0:
        raise ValueError(f"target power is already reached at {what} = {lo:g}")
    while f(hi) < 0:
        if hi >= limit:
            raise ValueError(f"cannot reach the target power with {what} up to {limit:g}")
        hi *= 2
    return float(optimize.brentq(f, lo, hi, xtol=1e-12, rtol=1e-15, maxiter=500))


def sample_size_ttest_ind(
    effect_size: float,
    power: float = 0.8,
    alpha: float = 0.05,
    ratio: float = 1.0,
    alternative: str = "two-sided",
) -> float:
    """Control-group size ``nobs1`` that reaches ``power`` (not rounded up)."""
    d, alpha = _check_effect(effect_size), check_alpha(alpha)
    power, ratio = _check_power(power, alpha), _check_ratio(ratio)
    alternative = check_alternative(alternative)
    lo = 2 / (1 + ratio) + 1  # df = 1 + ratio > 0

    def gap(n1: float) -> float:
        return power_ttest_ind(d, n1, alpha, ratio, alternative) - power

    return _root(gap, lo, 1e3, _MAX_NOBS, "nobs1")


def mde_ttest_ind(
    nobs1: float,
    power: float = 0.8,
    alpha: float = 0.05,
    ratio: float = 1.0,
    alternative: str = "two-sided",
) -> float:
    """Smallest Cohen's d detectable with ``power``; negative for ``alternative="less"``."""
    alpha = check_alpha(alpha)
    power, ratio = _check_power(power, alpha), _check_ratio(ratio)
    alternative = check_alternative(alternative)
    sign = -1.0 if alternative == "less" else 1.0
    power_ttest_ind(0.0, nobs1, alpha, ratio, alternative)  # validates nobs1

    def gap(magnitude: float) -> float:
        return power_ttest_ind(sign * magnitude, nobs1, alpha, ratio, alternative) - power

    return sign * _root(gap, 0.0, 1.0, _MAX_EFFECT, "effect_size")


def cohens_h(p_treatment: float, p_control: float) -> float:
    """h = 2 asin(sqrt(p_treatment)) - 2 asin(sqrt(p_control))."""
    for name, p in (("p_treatment", p_treatment), ("p_control", p_control)):
        if not 0 < check_finite(name, p) < 1:
            raise ValueError(f"{name} must be a proportion in (0, 1), got {p!r}")
    return 2 * math.asin(math.sqrt(p_treatment)) - 2 * math.asin(math.sqrt(p_control))


def power_proportions(
    p_control: float,
    p_treatment: float,
    nobs1: float,
    alpha: float = 0.05,
    ratio: float = 1.0,
    alternative: str = "two-sided",
) -> float:
    """Power of a two-proportion z-test on Cohen's h (normal approximation)."""
    h = cohens_h(p_treatment, p_control)
    alpha, alternative, ratio = (
        check_alpha(alpha),
        check_alternative(alternative),
        _check_ratio(ratio),
    )
    return _normal_power(h, nobs1, alpha, ratio, alternative)


def sample_size_proportions(
    p_control: float,
    p_treatment: float,
    power: float = 0.8,
    alpha: float = 0.05,
    ratio: float = 1.0,
    alternative: str = "two-sided",
) -> ProportionSampleSize:
    """Control-group size to detect ``p_control → p_treatment`` (not rounded up)."""
    h = cohens_h(p_treatment, p_control)
    if h == 0:
        raise ValueError("p_control and p_treatment must differ to solve for a sample size")
    alpha = check_alpha(alpha)
    power, ratio = _check_power(power, alpha), _check_ratio(ratio)
    alternative = check_alternative(alternative)

    def gap(n1: float) -> float:
        return _normal_power(h, n1, alpha, ratio, alternative) - power

    return ProportionSampleSize(h, _root(gap, 1e-9, 1e3, _MAX_NOBS, "nobs1"))
