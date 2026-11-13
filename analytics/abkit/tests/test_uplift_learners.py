"""Base learners for the meta-learners: L2 logistic and ridge regression in NumPy."""

import numpy as np
import pytest
from scipy.optimize import minimize
from scipy.special import expit

from abkit.uplift.learners import LogisticRegression, RidgeRegression


def _standardize(x: np.ndarray) -> np.ndarray:
    sd = x.std(axis=0)
    sd[sd == 0] = 1.0
    return np.column_stack([np.ones(len(x)), (x - x.mean(axis=0)) / sd])


def test_logistic_matches_an_independent_optimizer_of_the_same_loss() -> None:
    rng = np.random.default_rng(0)
    x = rng.normal(size=(3000, 4)) * [1.0, 3.0, 0.5, 10.0] + [0, 5, 0, -2]
    y = (rng.random(3000) < expit(-1 + x @ [0.8, -0.3, 1.2, 0.05])).astype(float)
    l2 = 5.0
    z = _standardize(x)

    def loss(w: np.ndarray) -> float:  # intercept is not penalized
        eta = z @ w
        return float(np.sum(np.logaddexp(0, eta) - y * eta) + 0.5 * l2 * w[1:] @ w[1:])

    ref = minimize(loss, np.zeros(5), method="BFGS", options={"gtol": 1e-10}).x
    model = LogisticRegression(l2=l2).fit(x, y)
    np.testing.assert_allclose(model.predict(x), expit(z @ ref), atol=1e-6)


def test_logistic_stays_finite_on_separable_and_rare_labels() -> None:
    rng = np.random.default_rng(1)
    x = rng.normal(size=(2000, 1))
    y = (x[:, 0] > 2.5).astype(float)  # perfectly separable, about 0.6% positive
    p = LogisticRegression(l2=1.0).fit(x, y).predict(x)
    assert np.all(np.isfinite(p))
    assert p[y == 1].min() > p[y == 0].max()  # the ranking is still perfect


def test_logistic_handles_a_constant_feature() -> None:
    rng = np.random.default_rng(2)
    x = np.column_stack([rng.normal(size=500), np.full(500, 3.0)])
    y = (rng.random(500) < 0.3).astype(float)
    assert np.all(np.isfinite(LogisticRegression().fit(x, y).predict(x)))


@pytest.mark.parametrize("y", [np.zeros(10), np.ones(10), np.array([0, 1, 2, 0, 1, 0, 1, 0, 1, 0])])
def test_logistic_rejects_labels_that_are_not_two_classes_of_zero_one(y: np.ndarray) -> None:
    with pytest.raises(ValueError, match="0/1"):
        LogisticRegression().fit(np.arange(10.0).reshape(-1, 1), y)


def test_predict_before_fit_raises() -> None:
    with pytest.raises(RuntimeError, match="fit"):
        LogisticRegression().predict(np.zeros((2, 1)))
    with pytest.raises(RuntimeError, match="fit"):
        RidgeRegression().predict(np.zeros((2, 1)))


def test_ridge_is_least_squares_when_unpenalized_and_shrinks_when_penalized() -> None:
    rng = np.random.default_rng(3)
    x = rng.normal(size=(400, 3)) * [1, 4, 0.2]
    y = 2.0 + x @ [1.5, -0.5, 3.0] + rng.normal(size=400)
    ols, *_ = np.linalg.lstsq(np.column_stack([np.ones(400), x]), y, rcond=None)
    fitted = RidgeRegression(l2=0.0).fit(x, y).predict(x)
    np.testing.assert_allclose(fitted, np.column_stack([np.ones(400), x]) @ ols, atol=1e-9)
    z = _standardize(x)
    penalty = np.diag([0.0, 1.0, 1.0, 1.0]) * 50.0
    w = np.linalg.solve(z.T @ z + penalty, z.T @ y)
    np.testing.assert_allclose(RidgeRegression(l2=50.0).fit(x, y).predict(x), z @ w, atol=1e-9)


def test_learners_reject_mismatched_or_empty_input() -> None:
    with pytest.raises(ValueError, match="rows"):
        RidgeRegression().fit(np.zeros((3, 1)), np.zeros(4))
    with pytest.raises(ValueError, match="rows"):
        LogisticRegression().fit(np.zeros((0, 1)), np.zeros(0))
    with pytest.raises(ValueError, match="l2"):
        RidgeRegression(l2=-1.0)
