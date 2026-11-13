"""Result types of the DiD estimators (B2 plan, PR 19)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import stats as sps

from abkit.causal.estimators import CausalResult


@dataclass(frozen=True)
class EventTime:
    rel: int
    estimate: float
    se: float
    ci_low: float
    ci_high: float
    p_value: float
    #: Treated rows at this event time in the identified cohorts.
    n_obs: int


@dataclass(frozen=True, eq=False)
class EventStudy:
    method: str
    pre: int
    post: int
    alpha: float
    event_times: tuple[EventTime, ...]
    #: Covariance of the event-time estimates, in ``event_times`` order.
    event_vcov: np.ndarray
    att: CausalResult
    pretrend_stat: float
    pretrend_df: int
    pretrend_p: float
    #: Sun & Abraham's (cohort, event time) coefficients; empty for the pooled TWFE.
    cohort_effects: dict[tuple[int, int], float]
    cohorts: tuple[int, ...]
    dropped_cohorts: tuple[int, ...]
    n_obs: int
    n_treated_units: int
    n_control_units: int
    n_clusters: int

    def event(self, rel: int) -> EventTime:
        for e in self.event_times:
            if e.rel == rel:
                return e
        raise KeyError(rel)


def normal_inference(estimate: float, se: float, alpha: float) -> tuple[float, float, float]:
    """Normal-based interval and two-sided p; p is NaN when the standard error is zero."""
    z = float(sps.norm.ppf(1 - alpha / 2))
    with np.errstate(divide="ignore", invalid="ignore"):
        p = float(2 * sps.norm.sf(abs(estimate / se))) if se > 0 else float("nan")
    return estimate - z * se, estimate + z * se, p


def wald_test(estimate: np.ndarray, cov: np.ndarray) -> tuple[float, int, float]:
    """Joint Wald chi-square that ``estimate`` is zero: (statistic, df, p).

    The statistic uses the generalized inverse of ``cov`` and the degrees of freedom are its
    numerical rank, so a singular covariance (event times that move together) is tested on
    the directions it identifies only. With no identified direction the test is NaN, df 0.
    """
    estimate, cov = np.asarray(estimate, dtype=np.float64), np.asarray(cov, dtype=np.float64)
    if estimate.size == 0:
        return float("nan"), 0, float("nan")
    values, vectors = np.linalg.eigh((cov + cov.T) / 2)
    top = float(values.max())
    keep = values > max(top, 0.0) * estimate.size * np.finfo(float).eps
    if top <= 0 or not keep.any():
        return float("nan"), 0, float("nan")
    projected = vectors[:, keep].T @ estimate
    stat = float(np.sum(projected**2 / values[keep]))
    df = int(keep.sum())
    return stat, df, float(sps.chi2.sf(stat, df))
