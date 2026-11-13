"""CATE by group (e.g. persona): a Welch test inside each group, and Cochran's Q across them.

The conditional average treatment effect of a discrete covariate is the difference in means
among the users of that group. Q = sum_k w_k (tau_k - tau_pooled)^2 with w_k = 1 / se_k^2
tests whether all groups share one effect (chi-square, K - 1 df).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike
from scipy import stats

from abkit.stats._common import as_sample, check_alpha, significance
from abkit.stats.welch import welch_ttest


@dataclass(frozen=True)
class GroupEffect:
    """``estimate`` is mean(treatment) - mean(control) among the users of ``group``."""

    group: str
    n_control: int
    n_treatment: int
    estimate: float
    se: float
    p_value: float
    ci_low: float
    ci_high: float


@dataclass(frozen=True)
class CateResult:
    groups: tuple[GroupEffect, ...]
    #: Inverse-variance weighted mean of the group effects.
    pooled_estimate: float
    pooled_se: float
    q_statistic: float
    q_df: int
    q_p_value: float
    alpha: float

    def effect(self, group: str) -> GroupEffect:
        for g in self.groups:
            if g.group == group:
                return g
        raise KeyError(group)

    @property
    def heterogeneity(self) -> str:
        return significance(self.q_p_value, self.alpha)


def _treated_mask(treated: ArrayLike, size: int) -> np.ndarray:
    arr = np.asarray(treated)
    if arr.ndim != 1 or arr.size != size:
        raise ValueError(f"values, treated and groups must have the same length, got {arr.size}")
    if not np.isin(arr, (0, 1)).all():
        raise ValueError("treated must hold only 0/1 or booleans")
    return arr.astype(bool)


def cate_by_group(
    values: ArrayLike, treated: ArrayLike, groups: ArrayLike, alpha: float = 0.05
) -> CateResult:
    """Per-group Welch effects (groups sorted) and the Q test of equal effects."""
    alpha = check_alpha(alpha)
    y = as_sample("values", values)
    t = _treated_mask(treated, y.size)
    labels = np.asarray(groups)
    if labels.ndim != 1 or labels.size != y.size:
        raise ValueError("values, treated and groups must have the same length")
    keys, codes = np.unique(labels, return_inverse=True)
    if keys.size < 2:
        raise ValueError(f"CATE needs at least 2 groups, got {keys.size}")
    effects = []
    for code, key in enumerate(keys):
        in_group = codes == code
        control, treatment = y[in_group & ~t], y[in_group & t]
        if control.size < 2 or treatment.size < 2:
            raise ValueError(
                f"group {key} needs at least 2 users per arm, "
                f"got {control.size} control and {treatment.size} treatment"
            )
        w = welch_ttest(control, treatment, alpha=alpha)
        effects.append(
            GroupEffect(
                str(key),
                control.size,
                treatment.size,
                w.estimate,
                w.se,
                w.p_value,
                w.ci_low,
                w.ci_high,
            )
        )
    estimates = np.array([e.estimate for e in effects])
    weights = 1.0 / np.array([e.se for e in effects]) ** 2
    pooled = float(np.sum(weights * estimates) / np.sum(weights))
    q = float(np.sum(weights * (estimates - pooled) ** 2))
    df = len(effects) - 1
    return CateResult(
        groups=tuple(effects),
        pooled_estimate=pooled,
        pooled_se=float(np.sqrt(1.0 / np.sum(weights))),
        q_statistic=q,
        q_df=df,
        q_p_value=float(stats.chi2.sf(q, df)),
        alpha=alpha,
    )
