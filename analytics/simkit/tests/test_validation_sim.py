"""Validation of abkit on SIMULATED experiments with a known injected effect (B2 plan, PR 14).

The recorded run uses 1,000 experiments per size; these tests use a few hundred and bound
each rate or bias by its Monte Carlo standard error.
"""

import math

import numpy as np
import pytest
from abkit.stats import power_proportions

from simkit.conversion import save_probability
from simkit.personas import PERSONAS
from simkit.validation_sim import (
    PERSONA_MULTIPLIERS,
    build_scenario,
    simulate_runs,
    summarize,
)

N_USERS, N_RUNS = 4000, 300
SCENARIO = build_scenario()


def _mc_se(rate: float, n: int) -> float:
    return math.sqrt(rate * (1 - rate) / n)


@pytest.fixture(scope="module")
def effect_runs():
    return simulate_runs(SCENARIO, N_USERS, N_RUNS, seed=5)


@pytest.fixture(scope="module")
def aa_runs():
    return simulate_runs(SCENARIO.null(), N_USERS, N_RUNS, seed=6)


def test_scenario_injects_plus_three_percent_on_the_population_save_rate() -> None:
    assert SCENARIO.names == tuple(p.name for p in PERSONAS)
    assert SCENARIO.weights == pytest.approx([p.weight for p in PERSONAS])
    assert SCENARIO.p_control == pytest.approx([save_probability(p) for p in PERSONAS])
    assert SCENARIO.p_treatment_all / SCENARIO.p_control_all - 1 == pytest.approx(0.03)
    assert SCENARIO.ate == pytest.approx(SCENARIO.p_treatment_all - SCENARIO.p_control_all)
    assert SCENARIO.ate == pytest.approx(
        sum(w * t for w, t in zip(SCENARIO.weights, SCENARIO.truth, strict=False))
    )


def test_persona_lifts_follow_the_multipliers() -> None:
    lifts = [t / p for t, p in zip(SCENARIO.truth, SCENARIO.p_control, strict=True)]
    multipliers = [PERSONA_MULTIPLIERS[name] for name in SCENARIO.names]
    ratios = [lift / m for lift, m in zip(lifts, multipliers, strict=True)]
    assert ratios == pytest.approx([ratios[0]] * 3)
    assert lifts[0] < lifts[1] < lifts[2]


def test_null_scenario_has_no_effect_anywhere() -> None:
    null = SCENARIO.null()
    assert null.p_treatment == null.p_control
    assert null.truth == (0.0, 0.0, 0.0)
    assert null.ate == 0.0


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"relative_lift": -1.0}, "relative_lift"),
        ({"multipliers": {"browser": 1.0, "planner": 1.0}}, "power"),
        ({"multipliers": {"browser": 0.0, "planner": 0.0, "power": 0.0}}, "multipliers"),
        ({"multipliers": {"browser": -1.0, "planner": 1.0, "power": 1.0}}, "multipliers"),
        ({"relative_lift": 1.0}, "treatment rate"),
    ],
)
def test_bad_scenarios_raise(kwargs, message) -> None:
    with pytest.raises(ValueError, match=message):
        build_scenario(**kwargs)


def test_runs_are_seeded_and_shaped(effect_runs) -> None:
    again = simulate_runs(SCENARIO, N_USERS, N_RUNS, seed=5)
    np.testing.assert_array_equal(again.ate, effect_runs.ate)
    np.testing.assert_array_equal(again.cate, effect_runs.cate)
    other = simulate_runs(SCENARIO, N_USERS, 20, seed=7)
    assert not np.array_equal(other.ate, effect_runs.ate[:20])
    assert effect_runs.ate.shape == (N_RUNS,)
    assert effect_runs.cate.shape == effect_runs.cate_low.shape == (N_RUNS, 3)
    assert np.all(effect_runs.cate_low < effect_runs.cate_high)


def test_bad_run_arguments_raise() -> None:
    with pytest.raises(ValueError, match="n_users"):
        simulate_runs(SCENARIO, 10, 5, seed=1)
    with pytest.raises(ValueError, match="n_runs"):
        simulate_runs(SCENARIO, 1000, 0, seed=1)


def test_ate_and_cate_recover_the_injected_effect_without_bias(effect_runs) -> None:
    s = summarize(SCENARIO, effect_runs)
    assert abs(s.ate_bias) < 4 * s.ate_bias_se
    for bias, se in zip(s.cate_bias, s.cate_bias_se, strict=True):
        assert abs(bias) < 4 * se
    assert s.ate_bias == pytest.approx(float(np.mean(effect_runs.ate)) - SCENARIO.ate)
    assert s.ate_bias_se == pytest.approx(
        float(np.std(effect_runs.ate, ddof=1)) / math.sqrt(N_RUNS)
    )


def test_ci95_covers_the_injected_effect_95_percent_of_the_time(effect_runs) -> None:
    s = summarize(SCENARIO, effect_runs)
    band = 4 * _mc_se(0.95, N_RUNS)
    assert abs(s.ate_coverage - 0.95) < band
    for coverage in s.cate_coverage:
        assert abs(coverage - 0.95) < band


def test_cate_rmse_is_the_root_mean_squared_error(effect_runs) -> None:
    s = summarize(SCENARIO, effect_runs)
    errors = effect_runs.cate - np.array(SCENARIO.truth)
    np.testing.assert_allclose(s.cate_rmse, np.sqrt(np.mean(errors**2, axis=0)), rtol=1e-12)
    mse_se = np.std(errors**2, axis=0, ddof=1) / math.sqrt(N_RUNS)
    np.testing.assert_allclose(s.cate_rmse_se, mse_se / (2 * np.array(s.cate_rmse)), rtol=1e-12)


def test_aa_false_positive_rates_stay_at_alpha(aa_runs) -> None:
    s = summarize(SCENARIO.null(), aa_runs)
    band = 4 * _mc_se(0.05, N_RUNS)
    assert abs(s.reject_rate - 0.05) < band
    assert abs(s.heterogeneity_reject_rate - 0.05) < band
    assert s.rank_accuracy is None  # no true order when every effect is 0


def test_empirical_power_matches_the_analytic_formula() -> None:
    scenario = build_scenario(relative_lift=0.08)
    s = summarize(scenario, simulate_runs(scenario, N_USERS, N_RUNS, seed=8))
    analytic = power_proportions(scenario.p_control_all, scenario.p_treatment_all, N_USERS / 2)
    assert s.analytic_power == pytest.approx(analytic)
    assert 0.2 < analytic < 0.6
    assert abs(s.reject_rate - analytic) < 4 * _mc_se(analytic, N_RUNS)


def test_strong_heterogeneity_is_detected_and_ranked() -> None:
    scenario = build_scenario(relative_lift=0.25)
    s = summarize(scenario, simulate_runs(scenario, N_USERS, 100, seed=9))
    assert s.heterogeneity_reject_rate > 0.8
    assert s.rank_accuracy > 0.8
    assert s.n_users == N_USERS and s.n_runs == 100
