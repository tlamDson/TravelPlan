"""Benjamini-Hochberg control of the false discovery rate across many metrics."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike

from abkit.stats._common import check_alpha


@dataclass(frozen=True)
class BhResult:
    """``p_adjusted`` and ``rejected`` are in the input order."""

    p_adjusted: tuple[float, ...]
    rejected: tuple[bool, ...]
    alpha: float

    @property
    def n_rejected(self) -> int:
        return sum(self.rejected)


def bh_fdr(p_values: ArrayLike, alpha: float = 0.05) -> BhResult:
    """Step-up BH: p_adj(k) = min over j >= k of m/j * p_(j), capped at 1.

    A hypothesis is rejected when ``p_adj <= alpha`` (BH's rule p_(k) <= k/m * alpha).
    """
    alpha = check_alpha(alpha)
    p = np.asarray(p_values, dtype=np.float64)
    if p.ndim != 1:
        raise ValueError(f"p_values must be 1-D, got shape {p.shape}")
    if p.size < 1:
        raise ValueError("p_values needs at least 1 value")
    if not np.all(np.isfinite(p)):
        raise ValueError("p_values must hold only finite values")
    if np.any((p < 0) | (p > 1)):
        raise ValueError("p_values must lie in [0, 1]")
    m = p.size
    order = np.argsort(p, kind="stable")
    scaled = p[order] * m / np.arange(1, m + 1)
    stepped = np.minimum(np.minimum.accumulate(scaled[::-1])[::-1], 1.0)
    adjusted = np.empty(m)
    adjusted[order] = stepped
    return BhResult(
        p_adjusted=tuple(float(v) for v in adjusted),
        rejected=tuple(bool(v) for v in adjusted <= alpha),
        alpha=alpha,
    )
