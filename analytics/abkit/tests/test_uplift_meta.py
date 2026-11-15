"""T-learner and X-learner (Künzel et al. 2019) on randomized data with a known effect."""

import numpy as np
import pytest
from scipy.special import expit

from abkit.uplift.learners import LogisticRegression, RidgeRegression
from abkit.uplift.meta import TLearner, XLearner


def _binary_rct(n: int = 40_000, seed: int = 0):
    rng = np.random.default_rng(seed)
    x = rng.normal(size=(n, 3))
    t = (rng.random(n) < 0.85).astype(float)
    base = -2.0 + 0.5 * x[:, 1]
    lift = 0.2 + 0.9 * x[:, 0]
    true_tau = expit(base + lift) - expit(base)
    y = (rng.random(n) < expit(base + t * lift)).astype(float)
    return x, t, y, true_tau


def _linear_rct(n: int = 20_000, seed: int = 1):
    rng = np.random.default_rng(seed)
    x = rng.normal(size=(n, 2))
    t = (rng.random(n) < 0.3).astype(float)
    true_tau = 1.0 + 2.0 * x[:, 0]
    y = 3.0 - x[:, 1] + t * true_tau + rng.normal(size=n)
    return x, t, y, true_tau


def test_t_learner_is_the_difference_of_two_arm_models() -> None:
    x, t, y, _ = _binary_rct(5000)
    tau = TLearner().fit(x, t, y).predict(x)
    mu1 = LogisticRegression().fit(x[t == 1], y[t == 1]).predict(x)
    mu0 = LogisticRegression().fit(x[t == 0], y[t == 0]).predict(x)
    np.testing.assert_allclose(tau, mu1 - mu0, atol=1e-12)


@pytest.mark.parametrize("learner", [TLearner, XLearner])
def test_both_learners_rank_users_by_the_injected_effect(learner) -> None:
    x, t, y, true_tau = _binary_rct()
    tau = learner().fit(x, t, y).predict(x)
    assert np.corrcoef(tau, true_tau)[0, 1] > 0.9
    assert abs(tau.mean() - true_tau.mean()) < 0.01


def test_x_learner_recovers_a_linear_effect() -> None:
    x, t, y, true_tau = _linear_rct()
    model = XLearner(outcome_learner=RidgeRegression, effect_learner=RidgeRegression)
    tau = model.fit(x, t, y).predict(x)
    np.testing.assert_allclose(tau, true_tau, atol=0.15)
    assert model.propensity_ == pytest.approx(t.mean())


def test_x_learner_weights_the_two_effect_models_by_the_propensity() -> None:
    """tau(x) = g * tau0(x) + (1 - g) * tau1(x), with tau0 fit on control rows."""
    x, t, y, _ = _linear_rct(4000)
    model = XLearner(
        outcome_learner=RidgeRegression, effect_learner=RidgeRegression, propensity=0.25
    ).fit(x, t, y)
    mu0 = RidgeRegression().fit(x[t == 0], y[t == 0])
    mu1 = RidgeRegression().fit(x[t == 1], y[t == 1])
    tau1 = RidgeRegression().fit(x[t == 1], y[t == 1] - mu0.predict(x[t == 1]))
    tau0 = RidgeRegression().fit(x[t == 0], mu1.predict(x[t == 0]) - y[t == 0])
    expected = 0.25 * tau0.predict(x) + 0.75 * tau1.predict(x)
    np.testing.assert_allclose(model.predict(x), expected, atol=1e-12)


@pytest.mark.parametrize("learner", [TLearner, XLearner])
def test_learners_reject_bad_treatment_vectors(learner) -> None:
    x, t, y, _ = _binary_rct(200)
    with pytest.raises(ValueError, match="both arms"):
        learner().fit(x, np.ones_like(t), y)
    with pytest.raises(ValueError, match="0/1"):
        learner().fit(x, t * 2, y)
    with pytest.raises(ValueError, match="rows"):
        learner().fit(x, t[:-1], y)
    with pytest.raises(RuntimeError, match="fit"):
        learner().predict(x)


def test_x_learner_rejects_a_propensity_outside_zero_one() -> None:
    for g in (0.0, 1.0, -0.2):
        with pytest.raises(ValueError, match="propensity"):
            XLearner(propensity=g)
