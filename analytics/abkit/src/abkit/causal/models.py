"""Nuisance models for IPW / AIPW: logistic propensity (Newton / IRLS) and OLS outcome fits.

Only NumPy: the core install has no scikit-learn or statsmodels. Columns are standardized
before the Newton steps, so earnings in dollars and 0/1 dummies converge alike.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MAX_ITER = 100
STEP_TOL = 1e-10


@dataclass(frozen=True)
class LogitFit:
    #: Coefficients on the original (unstandardized) columns.
    coef: np.ndarray
    probabilities: np.ndarray
    iterations: int


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return np.exp(-np.logaddexp(0.0, -x))


def _scaler(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Center and scale non-constant columns; a constant column (the intercept) stays."""
    sd = x.std(axis=0)
    varying = sd > 0
    # Centering is only undone through a constant column; without one, only scale.
    can_center = not np.all(varying)
    center = np.where(varying & can_center, x.mean(axis=0), 0.0)
    scale = np.where(varying, sd, 1.0)
    return center, scale


def check_binary(name: str, t: np.ndarray) -> np.ndarray:
    t = np.asarray(t, dtype=np.float64)
    if t.ndim != 1 or not np.all((t == 0) | (t == 1)):
        raise ValueError(f"{name} must be a 1-D array of 0/1 values")
    return t


def fit_logit(x: np.ndarray, t: np.ndarray) -> LogitFit:
    """Maximum-likelihood logistic regression of ``t`` on the columns of ``x``.

    Raises ``ValueError`` when Newton does not converge or the Hessian is singular, which is
    what (quasi-)complete separation looks like.
    """
    x = np.asarray(x, dtype=np.float64)
    t = check_binary("treatment", t)
    if x.ndim != 2 or x.shape[0] != t.size:
        raise ValueError(f"x must be (n, k) with n = {t.size}, got {x.shape}")
    center, scale = _scaler(x)
    z = (x - center) / scale
    has_constant = bool(np.any(x.std(axis=0) == 0))
    beta = np.zeros(x.shape[1])
    iteration = 0
    while True:
        iteration += 1
        if iteration > MAX_ITER:
            raise ValueError(f"logit did not converge in {MAX_ITER} steps: separation?")
        p = _sigmoid(z @ beta)
        w = p * (1 - p)
        hessian = z.T @ (z * w[:, None])
        try:
            step = np.linalg.solve(hessian, z.T @ (t - p))
        except np.linalg.LinAlgError as err:
            raise ValueError("logit Hessian is singular: the treatment is separated") from err
        beta = beta + step
        if np.max(np.abs(step)) < STEP_TOL:
            break
    probabilities = _sigmoid(z @ beta)
    coef = beta / scale
    if has_constant:
        constant = int(np.argmax(x.std(axis=0) == 0))
        coef[constant] -= float(np.sum(center * coef)) / x[0, constant]
    return LogitFit(coef=coef, probabilities=probabilities, iterations=iteration)


def predict_logit(fit: LogitFit, x: np.ndarray) -> np.ndarray:
    return _sigmoid(np.asarray(x, dtype=np.float64) @ fit.coef)


def fit_ols(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Least-squares coefficients; collinear columns raise instead of being silently dropped."""
    x, y = np.asarray(x, dtype=np.float64), np.asarray(y, dtype=np.float64)
    if x.ndim != 2 or x.shape[0] != y.size:
        raise ValueError(f"x must be (n, k) with n = {y.size}, got {x.shape}")
    center, scale = _scaler(x)
    z = (x - center) / scale
    coef, _, rank, _ = np.linalg.lstsq(z, y, rcond=None)
    if rank < x.shape[1]:
        raise ValueError(f"outcome design has collinear columns (rank {rank} < {x.shape[1]})")
    coef = coef / scale
    if np.any(x.std(axis=0) == 0):
        constant = int(np.argmax(x.std(axis=0) == 0))
        coef[constant] -= float(np.sum(center * coef)) / x[0, constant]
    return coef
