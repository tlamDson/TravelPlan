"""Sample ratio mismatch: chi-square goodness of fit of the assignment counts.

Run before reading any result; a mismatch means the split is broken and the
experiment's numbers must not be trusted (Microsoft ExP threshold p < 0.0005).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike
from scipy import stats

SRM_THRESHOLD = 0.0005


@dataclass(frozen=True)
class SrmResult:
    statistic: float
    p_value: float
    dof: int
    threshold: float

    @property
    def srm(self) -> bool:
        return self.p_value < self.threshold

    @property
    def decision(self) -> str:
        return "srm" if self.srm else "no_srm"


def srm_chisquare(
    observed: ArrayLike, expected_share: ArrayLike, threshold: float = SRM_THRESHOLD
) -> SrmResult:
    """``observed`` counts per arm; ``expected_share`` planned weights (normalised here)."""
    if not (isinstance(threshold, int | float) and 0 < threshold < 1):
        raise ValueError(f"threshold must be in (0, 1), got {threshold!r}")
    counts = np.asarray(observed, dtype=np.float64)
    shares = np.asarray(expected_share, dtype=np.float64)
    if counts.ndim != 1 or counts.size < 2:
        raise ValueError("SRM needs at least 2 arms")
    if shares.shape != counts.shape:
        raise ValueError("observed and expected_share must have the same length")
    if not np.all(np.isfinite(counts)) or np.any(counts < 0):
        raise ValueError("observed counts must be finite and non-negative")
    if np.any(counts != np.round(counts)):
        raise ValueError("observed counts must be whole numbers")
    if not np.all(np.isfinite(shares)) or np.any(shares <= 0):
        raise ValueError("expected_share must be finite and positive")
    total = counts.sum()
    if total == 0:
        raise ValueError("observed has no units")
    expected = shares / shares.sum() * total
    statistic = float(((counts - expected) ** 2 / expected).sum())
    dof = counts.size - 1
    return SrmResult(
        statistic=statistic,
        p_value=float(stats.chi2.sf(statistic, dof)),
        dof=dof,
        threshold=float(threshold),
    )
