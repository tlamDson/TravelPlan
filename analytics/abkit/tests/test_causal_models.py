"""Nuisance models: logistic propensity (Newton / IRLS) and OLS outcome regression."""

import numpy as np
import pytest

from abkit.causal.models import fit_logit, fit_ols, predict_logit


def test_intercept_only_logit_is_the_treated_share() -> None:
    t = np.array([1.0, 0.0, 0.0, 1.0, 0.0])
    fit = fit_logit(np.ones((5, 1)), t)
    np.testing.assert_allclose(fit.probabilities, np.full(5, 0.4), rtol=1e-12)
    assert fit.coef[0] == pytest.approx(np.log(0.4 / 0.6), rel=1e-12)


def test_saturated_binary_covariate_reproduces_the_cell_shares() -> None:
    x = np.array([0, 0, 0, 0, 1, 1, 1, 1, 1], dtype=float)
    t = np.array([1, 0, 0, 0, 1, 1, 1, 0, 1], dtype=float)
    fit = fit_logit(np.column_stack([np.ones(9), x]), t)
    np.testing.assert_allclose(fit.probabilities[x == 0], 0.25, rtol=1e-10)
    np.testing.assert_allclose(fit.probabilities[x == 1], 0.8, rtol=1e-10)
    assert fit.iterations < 50


def test_logit_is_invariant_to_the_scale_of_a_covariate() -> None:
    rng = np.random.default_rng(1)
    x = rng.normal(size=400)
    t = (rng.random(400) < 1 / (1 + np.exp(-0.7 * x))).astype(float)
    small = fit_logit(np.column_stack([np.ones(400), x]), t)
    large = fit_logit(np.column_stack([np.ones(400), x * 1e5]), t)
    np.testing.assert_allclose(small.probabilities, large.probabilities, rtol=1e-9)
    np.testing.assert_allclose(
        predict_logit(small, np.column_stack([np.ones(400), x])), small.probabilities, rtol=1e-12
    )


def test_complete_separation_raises() -> None:
    x = np.array([1.0, 2.0, 3.0, 4.0])
    with pytest.raises(ValueError, match="separat"):
        fit_logit(np.column_stack([np.ones(4), x]), np.array([0.0, 0.0, 1.0, 1.0]))


def test_logit_rejects_a_non_binary_treatment() -> None:
    with pytest.raises(ValueError, match="0/1"):
        fit_logit(np.ones((3, 1)), np.array([0.0, 1.0, 2.0]))


def test_ols_recovers_an_exact_linear_relation() -> None:
    x = np.column_stack([np.ones(5), np.arange(5.0)])
    y = 3.0 + 2.0 * np.arange(5.0)
    np.testing.assert_allclose(fit_ols(x, y), [3.0, 2.0], atol=1e-12)


def test_ols_rejects_collinear_columns() -> None:
    x = np.column_stack([np.ones(4), np.arange(4.0), 2 * np.arange(4.0)])
    with pytest.raises(ValueError, match="collinear"):
        fit_ols(x, np.arange(4.0))
