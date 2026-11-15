"""Base learners in NumPy: L2-penalized logistic regression and ridge regression.

Both standardize each feature on the training rows (a constant feature is left
centred, not divided by zero) and never penalize the intercept, so the penalty
does not depend on the scale of a feature.
"""

from __future__ import annotations

from typing import Protocol

import numpy as np
from scipy.special import expit


class Learner(Protocol):
    def fit(self, x: np.ndarray, y: np.ndarray) -> Learner: ...

    def predict(self, x: np.ndarray) -> np.ndarray: ...


class _Linear:
    def __init__(self, l2: float) -> None:
        if not l2 >= 0:
            raise ValueError(f"l2 must be >= 0, got {l2}")
        self.l2 = float(l2)
        self.coef_: np.ndarray | None = None

    def _design(self, x: np.ndarray, fit: bool = False) -> np.ndarray:
        x = np.asarray(x, dtype=np.float64)
        if x.ndim != 2:
            raise ValueError(f"x must be 2-D, got shape {x.shape}")
        if fit:
            self.mean_ = x.mean(axis=0)
            sd = x.std(axis=0)
            self.scale_ = np.where(sd > 0, sd, 1.0)
        elif self.coef_ is None:
            raise RuntimeError(f"{type(self).__name__}: call fit before predict")
        return np.column_stack([np.ones(len(x)), (x - self.mean_) / self.scale_])

    def _penalty(self, k: int) -> np.ndarray:
        return np.diag(np.r_[0.0, np.full(k - 1, self.l2)])

    @staticmethod
    def _check_rows(x: np.ndarray, y: np.ndarray) -> np.ndarray:
        y = np.asarray(y, dtype=np.float64)
        if len(x) != len(y) or len(y) == 0:
            raise ValueError(f"x and y need the same, non-zero number of rows: {len(x)}, {len(y)}")
        return y

    def predict_linear(self, x: np.ndarray) -> np.ndarray:
        return self._design(x) @ self.coef_


class RidgeRegression(_Linear):
    """Least squares with ``l2 * ||w||^2`` on the standardized slopes."""

    def __init__(self, l2: float = 1.0) -> None:
        super().__init__(l2)

    def fit(self, x: np.ndarray, y: np.ndarray) -> RidgeRegression:
        y = self._check_rows(x, y)
        z = self._design(x, fit=True)
        gram = z.T @ z + self._penalty(z.shape[1])
        self.coef_ = np.linalg.lstsq(gram, z.T @ y, rcond=None)[0]
        return self

    def predict(self, x: np.ndarray) -> np.ndarray:
        return self.predict_linear(x)


class LogisticRegression(_Linear):
    """Logistic regression with ``l2 / 2 * ||w||^2``, fit by Newton steps with backtracking.

    Backtracking keeps every step from raising the penalized loss, so rare or separable
    labels (Criteo converts 0.3% of users) give finite coefficients instead of diverging.
    ``predict`` returns probabilities.
    """

    def __init__(self, l2: float = 10.0, max_iter: int = 100, tol: float = 1e-12) -> None:
        super().__init__(l2)
        self.max_iter = max_iter
        self.tol = tol

    def fit(self, x: np.ndarray, y: np.ndarray) -> LogisticRegression:
        y = self._check_rows(x, y)
        if not np.isin(y, (0.0, 1.0)).all() or y.min() == y.max():
            raise ValueError("y must hold 0/1 labels with both classes present")
        z = self._design(x, fit=True)
        penalty = self._penalty(z.shape[1])

        def loss(w: np.ndarray) -> float:
            eta = z @ w
            return float(np.sum(np.logaddexp(0.0, eta) - y * eta) + 0.5 * w @ penalty @ w)

        w = np.zeros(z.shape[1])
        w[0] = np.log(y.mean() / (1 - y.mean()))
        current = loss(w)
        for _ in range(self.max_iter):
            p = expit(z @ w)
            grad = z.T @ (p - y) + penalty @ w
            hess = (z * (p * (1 - p))[:, None]).T @ z + penalty
            step = np.linalg.lstsq(hess, grad, rcond=None)[0]
            size, candidate = 1.0, loss(w - step)
            while candidate > current and size > 1e-10:
                size /= 2
                candidate = loss(w - size * step)
            if candidate > current:
                break
            w, previous, current = w - size * step, current, candidate
            if previous - current <= self.tol * max(abs(previous), 1.0):
                break
        self.coef_ = w
        return self

    def predict(self, x: np.ndarray) -> np.ndarray:
        return expit(self.predict_linear(x))
