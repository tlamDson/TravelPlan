"""Input checks, p-values and intervals shared by the abkit tests."""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np
from numpy.typing import ArrayLike

ALTERNATIVES = ("two-sided", "greater", "less")
#: statsmodels spells the one-sided alternatives differently; both are accepted.
_ALIASES = {"larger": "greater", "smaller": "less"}


def check_alternative(alternative: str) -> str:
    alternative = _ALIASES.get(alternative, alternative)
    if alternative not in ALTERNATIVES:
        raise ValueError(f"alternative must be one of {ALTERNATIVES}, got {alternative!r}")
    return alternative


def check_alpha(alpha: float) -> float:
    if not (isinstance(alpha, int | float) and 0 < alpha < 1):
        raise ValueError(f"alpha must be in (0, 1), got {alpha!r}")
    return float(alpha)


def check_finite(name: str, value: float) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number, got {value!r}")
    return float(value)


def as_sample(name: str, values: ArrayLike, min_size: int = 2) -> np.ndarray:
    """A 1-D float64 array of finite values with at least ``min_size`` entries."""
    arr = np.asarray(values, dtype=np.float64)
    if arr.ndim != 1:
        raise ValueError(f"{name} must be 1-D, got shape {arr.shape}")
    if arr.size < min_size:
        raise ValueError(f"{name} needs at least {min_size} values, got {arr.size}")
    if not np.all(np.isfinite(arr)):
        raise ValueError(f"{name} must hold only finite values")
    return arr


def p_value(statistic: float, dist, alternative: str) -> float:
    """``dist`` is a frozen scipy distribution of the statistic under the null."""
    if alternative == "two-sided":
        return float(2 * dist.sf(abs(statistic)))
    if alternative == "greater":
        return float(dist.sf(statistic))
    return float(dist.cdf(statistic))


def interval(estimate: float, se: float, dist, alpha: float, alternative: str) -> Sequence[float]:
    """Confidence bounds at level ``1 - alpha``; one-sided tests get an infinite side."""
    if alternative == "two-sided":
        half = float(dist.ppf(1 - alpha / 2)) * se
        return estimate - half, estimate + half
    half = float(dist.ppf(1 - alpha)) * se
    if alternative == "greater":
        return estimate - half, math.inf
    return -math.inf, estimate + half


def significance(p: float, alpha: float) -> str:
    return "reject_null" if p < alpha else "fail_to_reject"
