"""Two-way fixed-effects OLS with repo-clustered errors (B2 plan, PR 19)."""

import numpy as np
import pytest
from did_fixtures import dummy_ols

from abkit.did.fe import fe_ols


def _unbalanced(seed: int = 3, units: int = 30, periods: int = 8):
    rng = np.random.default_rng(seed)
    unit = np.repeat(np.arange(units), periods)
    time = np.tile(np.arange(periods), units)
    keep = rng.random(unit.size) > 0.25
    unit, time = unit[keep], time[keep]
    x = rng.normal(size=(unit.size, 3))
    x[:, 0] += 0.5 * time  # a regressor correlated with the period effects
    y = (
        x @ np.array([0.7, -1.2, 0.3])
        + rng.normal(size=units)[unit]
        + rng.normal(size=periods)[time]
        + rng.normal(size=unit.size)
    )
    w = rng.uniform(0.5, 3.0, unit.size)
    return x, y, unit, time, w


def test_slopes_match_ols_with_explicit_unit_and_period_dummies() -> None:
    x, y, unit, time, w = _unbalanced()
    fit = fe_ols(x, y, unit, time, weight=w)
    expected, _ = dummy_ols(x, y, unit, time, w)
    np.testing.assert_allclose(fit.coef, expected, rtol=1e-9, atol=1e-10)
    assert fit.kept.tolist() == [True, True, True]
    assert (fit.n_obs, fit.n_clusters) == (unit.size, 30)


def test_unweighted_fit_is_the_unit_weight_fit() -> None:
    x, y, unit, time, _ = _unbalanced(seed=5)
    a = fe_ols(x, y, unit, time)
    b = fe_ols(x, y, unit, time, weight=np.ones(unit.size))
    np.testing.assert_allclose(a.coef, b.coef, rtol=1e-12)
    np.testing.assert_allclose(a.vcov, b.vcov, rtol=1e-12)


def test_vcov_is_the_cr1_cluster_sandwich_by_unit() -> None:
    x, y, unit, time, w = _unbalanced(seed=7)
    fit = fe_ols(x, y, unit, time, weight=w)
    beta, resid = dummy_ols(x, y, unit, time, w)
    # the slope block of the full-dummy sandwich equals the sandwich on the within regressors
    _, u = np.unique(unit, return_inverse=True)
    _, t = np.unique(time, return_inverse=True)
    z = np.column_stack([x, np.eye(u.max() + 1)[u], np.eye(t.max() + 1)[t][:, 1:]])
    bread = np.linalg.pinv(z.T @ (w[:, None] * z))[:3]
    scores = (w * resid)[:, None] * z
    meat_rows = np.zeros((u.max() + 1, z.shape[1]))
    np.add.at(meat_rows, u, scores)
    meat = meat_rows.T @ meat_rows
    n, g, k = unit.size, u.max() + 1, 3 + (t.max() + 1) - 1
    factor = g / (g - 1) * (n - 1) / (n - k)
    expected = factor * bread @ meat @ bread.T
    np.testing.assert_allclose(fit.vcov, expected, rtol=1e-8)
    np.testing.assert_allclose(fit.coef, beta, rtol=1e-9)


def test_a_custom_cluster_changes_only_the_errors() -> None:
    x, y, unit, time, w = _unbalanced(seed=9)
    by_unit = fe_ols(x, y, unit, time, weight=w)
    by_pair = fe_ols(x, y, unit, time, weight=w, cluster=unit // 2)
    np.testing.assert_allclose(by_pair.coef, by_unit.coef, rtol=1e-12)
    assert by_pair.n_clusters == 15
    assert not np.allclose(by_pair.vcov, by_unit.vcov)


def test_collinear_columns_are_dropped_and_reported_as_nan() -> None:
    x, y, unit, time, w = _unbalanced(seed=11)
    unit_constant = (unit % 3 == 0).astype(float)  # absorbed by the unit effects
    duplicated = 2.0 * x[:, 1]
    design = np.column_stack([x[:, 0], unit_constant, x[:, 1], duplicated])
    fit = fe_ols(design, y, unit, time, weight=w)
    assert fit.kept.tolist() == [True, False, True, False]
    assert np.isnan(fit.coef[[1, 3]]).all()
    assert np.isnan(fit.vcov[1]).all() and np.isnan(fit.vcov[:, 3]).all()
    expected, _ = dummy_ols(design[:, [0, 2]], y, unit, time, w)
    np.testing.assert_allclose(fit.coef[[0, 2]], expected, rtol=1e-9)


def test_fe_ols_rejects_mismatched_lengths() -> None:
    x, y, unit, time, _ = _unbalanced()
    with pytest.raises(ValueError, match="rows"):
        fe_ols(x[:-1], y, unit, time)
