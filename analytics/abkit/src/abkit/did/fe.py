"""Weighted OLS with unit and period fixed effects and cluster-robust errors (B2 plan, PR 19).

The fixed effects are partialled out exactly (Frisch-Waugh-Lovell): weighted demeaning
within units, then the residual projection on the unit-demeaned period dummies. A regressor
that is (numerically) a combination of the fixed effects and the regressors before it is
dropped, in column order, and reported with ``kept`` False and NaN coefficient and
covariance entries.

The covariance is the CR1 cluster sandwich (clusters default to the units):
``G/(G-1) * (N-1)/(N-K)`` with ``K`` the kept regressors plus the ``T-1`` period effects.
The unit effects are nested in the unit clusters, so they are not counted (as fixest does).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike

#: A column whose residual norm falls below this share of its own norm is collinear.
COLLINEAR_TOL = 1e-8


@dataclass(frozen=True, eq=False)
class FEFit:
    coef: np.ndarray
    vcov: np.ndarray
    kept: np.ndarray
    n_obs: int
    n_clusters: int


def _codes(values: ArrayLike) -> np.ndarray:
    return np.unique(np.asarray(values), return_inverse=True)[1].ravel()


def _unit_demean(a: np.ndarray, codes: np.ndarray, w: np.ndarray) -> np.ndarray:
    groups = int(codes.max()) + 1
    totals = np.zeros((groups, a.shape[1]))
    np.add.at(totals, codes, w[:, None] * a)
    mass = np.bincount(codes, weights=w, minlength=groups)
    return a - (totals / mass[:, None])[codes]


def within(a: np.ndarray, unit: np.ndarray, time: np.ndarray, w: np.ndarray) -> np.ndarray:
    """``a`` (n x k) with the weighted unit and period effects partialled out."""
    u, t = _codes(unit), _codes(time)
    a_u = _unit_demean(a, u, w)
    dummies = np.eye(int(t.max()) + 1)[t]
    d_u = _unit_demean(dummies, u, w)
    s = np.sqrt(w)[:, None]
    gamma, *_ = np.linalg.lstsq(d_u * s, a_u * s, rcond=None)
    return a_u - d_u @ gamma


def _independent(x: np.ndarray, norms: np.ndarray) -> np.ndarray:
    """Columns of the within regressors ``x`` not spanned by the columns before them.

    ``norms`` are the columns' norms before the fixed effects were partialled out, so a
    regressor the fixed effects absorb (residual norm ~ 0) is dropped too.
    """
    if x.shape[1] == 0:
        return np.zeros(0, dtype=bool)
    r = np.linalg.qr(x, mode="r")
    return np.abs(np.diag(r)) > COLLINEAR_TOL * np.maximum(norms, np.finfo(float).tiny)


def fe_ols(
    x: ArrayLike,
    y: ArrayLike,
    unit: ArrayLike,
    time: ArrayLike,
    weight: ArrayLike | None = None,
    cluster: ArrayLike | None = None,
) -> FEFit:
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    x = x[:, None] if x.ndim == 1 else x
    n, k = x.shape
    unit, time = np.asarray(unit), np.asarray(time)
    w = np.ones(n) if weight is None else np.asarray(weight, dtype=np.float64)
    clusters = _codes(unit if cluster is None else cluster)
    if any(a.shape[0] != n for a in (y, unit, time, w, clusters)):
        raise ValueError("x, y, unit, time, weight and cluster must have the same rows")
    both = within(np.column_stack([x, y]), unit, time, w)
    s = np.sqrt(w)
    kept = _independent(both[:, :k] * s[:, None], np.linalg.norm(x * s[:, None], axis=0))
    xk, yd = both[:, :k][:, kept], both[:, k]
    beta, *_ = np.linalg.lstsq(xk * s[:, None], yd * s, rcond=None)
    resid = yd - xk @ beta
    bread = np.linalg.inv(xk.T @ (w[:, None] * xk))
    groups = int(clusters.max()) + 1
    scores = np.zeros((groups, xk.shape[1]))
    np.add.at(scores, clusters, (w * resid)[:, None] * xk)
    n_params = xk.shape[1] + np.unique(time).size - 1
    factor = groups / (groups - 1) * (n - 1) / (n - n_params)
    v = factor * bread @ (scores.T @ scores) @ bread
    coef = np.full(k, np.nan)
    coef[kept] = beta
    vcov = np.full((k, k), np.nan)
    vcov[np.ix_(kept, kept)] = v
    return FEFit(coef=coef, vcov=vcov, kept=kept, n_obs=n, n_clusters=groups)
