"""Meta-learners for the conditional average treatment effect (Künzel et al., PNAS 2019).

``TLearner``: one outcome model per arm, ``tau(x) = mu1(x) - mu0(x)``.
``XLearner``: the same two outcome models, then imputed effects ``D1 = y - mu0(x)`` on
treated rows and ``D0 = mu1(x) - y`` on control rows, one effect model on each, and
``tau(x) = g * tau0(x) + (1 - g) * tau1(x)``. In a randomized test ``g`` is the treatment
share, so the effect model fit on the larger arm gets the larger weight.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np

from abkit.uplift.learners import Learner, LogisticRegression, RidgeRegression

LearnerFactory = Callable[[], Learner]


def _split(x: np.ndarray, treatment: np.ndarray, y: np.ndarray):
    x = np.asarray(x, dtype=np.float64)
    t = np.asarray(treatment, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    if not len(x) == len(t) == len(y):
        raise ValueError(f"x, treatment and y need the same rows: {len(x)}, {len(t)}, {len(y)}")
    if not np.isin(t, (0.0, 1.0)).all():
        raise ValueError("treatment must be 0/1")
    treated = t == 1
    if treated.all() or not treated.any():
        raise ValueError("treatment needs both arms")
    return x, treated, y


class TLearner:
    def __init__(self, outcome_learner: LearnerFactory = LogisticRegression) -> None:
        self.outcome_learner = outcome_learner
        self._models: tuple[Learner, Learner] | None = None

    def fit(self, x: np.ndarray, treatment: np.ndarray, y: np.ndarray) -> TLearner:
        x, treated, y = _split(x, treatment, y)
        mu0 = self.outcome_learner().fit(x[~treated], y[~treated])
        mu1 = self.outcome_learner().fit(x[treated], y[treated])
        self._models = (mu0, mu1)
        return self

    def predict(self, x: np.ndarray) -> np.ndarray:
        if self._models is None:
            raise RuntimeError("TLearner: call fit before predict")
        mu0, mu1 = self._models
        return mu1.predict(x) - mu0.predict(x)


class XLearner:
    def __init__(
        self,
        outcome_learner: LearnerFactory = LogisticRegression,
        effect_learner: LearnerFactory = RidgeRegression,
        propensity: float | None = None,
    ) -> None:
        if propensity is not None and not 0.0 < propensity < 1.0:
            raise ValueError(f"propensity must be in (0, 1), got {propensity}")
        self.outcome_learner = outcome_learner
        self.effect_learner = effect_learner
        self.propensity = propensity
        self._models: tuple[Learner, Learner] | None = None

    def fit(self, x: np.ndarray, treatment: np.ndarray, y: np.ndarray) -> XLearner:
        x, treated, y = _split(x, treatment, y)
        x0, y0, x1, y1 = x[~treated], y[~treated], x[treated], y[treated]
        mu0 = self.outcome_learner().fit(x0, y0)
        mu1 = self.outcome_learner().fit(x1, y1)
        tau1 = self.effect_learner().fit(x1, y1 - mu0.predict(x1))
        tau0 = self.effect_learner().fit(x0, mu1.predict(x0) - y0)
        self.propensity_ = self.propensity if self.propensity is not None else treated.mean()
        self._models = (tau0, tau1)
        return self

    def predict(self, x: np.ndarray) -> np.ndarray:
        if self._models is None:
            raise RuntimeError("XLearner: call fit before predict")
        tau0, tau1 = self._models
        g = self.propensity_
        return g * tau0.predict(x) + (1 - g) * tau1.predict(x)
