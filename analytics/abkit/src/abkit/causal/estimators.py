"""Naive difference in means, IPW and AIPW for a binary treatment (B2 plan, PR 17).

Estimands: ``ate`` (whole sample) and ``att`` (the treated units, as in LaLonde/NSW).

* IPW is the normalized (Hajek) weighted difference: ATE weights ``1/e`` for treated and
  ``1/(1-e)`` for controls; ATT weights 1 for treated and ``e/(1-e)`` for controls.
* AIPW (doubly robust) adds outcome-model predictions and applies the same normalized weights
  to the residuals: ATE = mean(mu1 - mu0) + Hajek(Y - mu1 | T=1) - Hajek(Y - mu0 | T=0);
  ATT = Hajek-IPW-ATT of ``Y - mu0``. It is consistent if either model is right.
* Standard errors are plug-in influence-function (linearization) SEs that treat the fitted
  propensity and outcome models as known; intervals and p-values are normal-based.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike
from scipy import stats as sps

from abkit.causal.models import check_binary
from abkit.stats import welch_ttest
from abkit.stats._common import check_alpha, interval, p_value, significance

ESTIMANDS = ("ate", "att")
SE_TYPES = ("welch", "pooled")


@dataclass(frozen=True)
class CausalResult:
    """``estimate`` is treated minus control on the chosen estimand."""

    method: str
    estimand: str
    estimate: float
    se: float
    statistic: float
    p_value: float
    ci_low: float
    ci_high: float
    alpha: float
    n_treated: int
    n_control: int

    @property
    def decision(self) -> str:
        return significance(self.p_value, self.alpha)


def _inputs(outcome: ArrayLike, treatment: ArrayLike) -> tuple[np.ndarray, np.ndarray]:
    y = np.asarray(outcome, dtype=np.float64)
    t = check_binary("treatment", treatment)
    if y.shape != t.shape:
        raise ValueError(f"outcome and treatment differ in length: {y.size} vs {t.size}")
    if not np.all(np.isfinite(y)):
        raise ValueError("outcome must hold only finite values")
    n_treated = int(t.sum())
    if n_treated < 2 or t.size - n_treated < 2:
        raise ValueError("need both treated and control units (at least 2 of each)")
    return y, t


def _vector(name: str, values: ArrayLike, n: int) -> np.ndarray:
    arr = np.asarray(values, dtype=np.float64)
    if arr.shape != (n,):
        raise ValueError(f"{name} has length {arr.size}, expected {n}")
    if not np.all(np.isfinite(arr)):
        raise ValueError(f"{name} must hold only finite values")
    return arr


def _propensity(values: ArrayLike, n: int) -> np.ndarray:
    e = _vector("propensity", values, n)
    if not np.all((e > 0) & (e < 1)):
        raise ValueError("propensity must lie strictly between 0 and 1")
    return e


def _check_estimand(estimand: str) -> str:
    if estimand not in ESTIMANDS:
        raise ValueError(f"estimand must be one of {ESTIMANDS}, got {estimand!r}")
    return estimand


def _result(method, estimand, estimate, se, dist, alpha, t) -> CausalResult:
    if not se > 0:
        raise ValueError("standard error is zero; the effect is not identified from this data")
    statistic = estimate / se
    ci_low, ci_high = interval(estimate, se, dist, alpha, "two-sided")
    n_treated = int(t.sum())
    return CausalResult(
        method=method,
        estimand=estimand,
        estimate=float(estimate),
        se=float(se),
        statistic=float(statistic),
        p_value=p_value(statistic, dist, "two-sided"),
        ci_low=ci_low,
        ci_high=ci_high,
        alpha=alpha,
        n_treated=n_treated,
        n_control=t.size - n_treated,
    )


def naive_diff(
    outcome: ArrayLike, treatment: ArrayLike, alpha: float = 0.05, se_type: str = "welch"
) -> CausalResult:
    """Difference in means. ``welch``: unequal-variance t (abkit.stats.welch_ttest);
    ``pooled``: the classical OLS standard error with n - 2 degrees of freedom."""
    alpha = check_alpha(alpha)
    if se_type not in SE_TYPES:
        raise ValueError(f"se_type must be one of {SE_TYPES}, got {se_type!r}")
    y, t = _inputs(outcome, treatment)
    y1, y0 = y[t == 1], y[t == 0]
    if se_type == "welch":
        welch = welch_ttest(y0, y1, alpha)
        return _result("naive_diff", "ate", welch.estimate, welch.se, sps.t(welch.df), alpha, t)
    df = y.size - 2
    pooled = ((y1.size - 1) * y1.var(ddof=1) + (y0.size - 1) * y0.var(ddof=1)) / df
    se = math.sqrt(pooled * (1 / y1.size + 1 / y0.size))
    return _result("naive_diff", "ate", y1.mean() - y0.mean(), se, sps.t(df), alpha, t)


def _weights(t: np.ndarray, e: np.ndarray, estimand: str) -> tuple[np.ndarray, np.ndarray]:
    if estimand == "ate":
        return t / e, (1 - t) / (1 - e)
    return t.copy(), (1 - t) * e / (1 - e)


def _hajek(values: np.ndarray, w: np.ndarray) -> tuple[float, np.ndarray]:
    """Weighted mean and each unit's linearization term ``w_i (v_i - mean) / sum(w)``."""
    total = w.sum()
    mean = float(np.sum(w * values) / total)
    return mean, w * (values - mean) / total


def ipw(
    outcome: ArrayLike,
    treatment: ArrayLike,
    propensity: ArrayLike,
    estimand: str = "ate",
    alpha: float = 0.05,
) -> CausalResult:
    """Normalized inverse-propensity weighting; ``propensity`` is P(T=1 | X) per unit."""
    alpha, estimand = check_alpha(alpha), _check_estimand(estimand)
    y, t = _inputs(outcome, treatment)
    e = _propensity(propensity, y.size)
    w1, w0 = _weights(t, e, estimand)
    mu1, a1 = _hajek(y, w1)
    mu0, a0 = _hajek(y, w0)
    se = math.sqrt(float(np.sum((a1 - a0) ** 2)))
    return _result("ipw", estimand, mu1 - mu0, se, sps.norm(), alpha, t)


def aipw(
    outcome: ArrayLike,
    treatment: ArrayLike,
    propensity: ArrayLike,
    mu0: ArrayLike,
    mu1: ArrayLike | None = None,
    estimand: str = "ate",
    alpha: float = 0.05,
) -> CausalResult:
    """Augmented IPW. ``mu0``/``mu1`` are each unit's predicted outcome under control /
    treatment; the ATT needs only ``mu0``."""
    alpha, estimand = check_alpha(alpha), _check_estimand(estimand)
    y, t = _inputs(outcome, treatment)
    e = _propensity(propensity, y.size)
    m0 = _vector("mu0", mu0, y.size)
    w1, w0 = _weights(t, e, estimand)
    if estimand == "att":
        r1, a1 = _hajek(y - m0, w1)
        r0, a0 = _hajek(y - m0, w0)
        se = math.sqrt(float(np.sum((a1 - a0) ** 2)))
        return _result("aipw", estimand, r1 - r0, se, sps.norm(), alpha, t)
    if mu1 is None:
        raise ValueError("the ATE needs mu1, the outcome model under treatment")
    m1 = _vector("mu1", mu1, y.size)
    gap = m1 - m0
    r1, a1 = _hajek(y - m1, w1)
    r0, a0 = _hajek(y - m0, w0)
    terms = (gap - gap.mean()) / y.size + a1 - a0
    estimate = gap.mean() + r1 - r0
    return _result(
        "aipw", estimand, estimate, math.sqrt(float(np.sum(terms**2))), sps.norm(), alpha, t
    )
