"""Peeking harness: simulated A/A tests read every day (M1) and CI coverage (M3).

Smaller ``n_sims`` than the 10,000 recorded run keeps the suite fast; bounds
use the Monte Carlo standard error of each rate.
"""

import math
from dataclasses import replace

import numpy as np
import pytest

from abkit.peeking import (
    PeekingConfig,
    cumulative_looks,
    main,
    simulate_peeking,
    to_run_records,
)
from abkit.runs import read_runs
from abkit.stats import welch_ttest

N_SIMS = 4000
AA = PeekingConfig(n_sims=N_SIMS, seed=11)
WITH_EFFECT = PeekingConfig(n_sims=N_SIMS, effect=0.003, seed=12)


def _mc_se(rate: float, n: int) -> float:
    return math.sqrt(rate * (1 - rate) / n)


@pytest.fixture(scope="module")
def aa_result():
    return simulate_peeking(AA)


@pytest.fixture(scope="module")
def effect_result():
    return simulate_peeking(WITH_EFFECT)


def test_defaults_are_the_recorded_run() -> None:
    config = PeekingConfig()
    assert (config.n_sims, config.days, config.alpha) == (10_000, 14, 0.05)
    assert config.effect == 0.0


def test_daily_t_test_inflates_the_false_positive_rate(aa_result) -> None:
    se = _mc_se(0.05, N_SIMS)
    assert abs(aa_result.ttest_fixed_reject_rate - 0.05) < 4 * se
    # 14 looks at a nominal 5% test: far above 5% (about 0.2 in theory).
    assert aa_result.ttest_peek_reject_rate > 0.12
    assert aa_result.ttest_peek_reject_rate >= aa_result.ttest_fixed_reject_rate


def test_msprt_keeps_the_false_positive_rate_under_alpha_while_peeking(aa_result) -> None:
    assert aa_result.msprt_peek_reject_rate <= 0.05 + 3 * _mc_se(0.05, N_SIMS)
    assert aa_result.msprt_peek_reject_rate < aa_result.ttest_peek_reject_rate


def test_ci_coverage_under_an_injected_effect(effect_result) -> None:
    se = _mc_se(0.95, N_SIMS)
    assert abs(effect_result.welch_fixed_coverage - 0.95) < 4 * se
    # Demanding the fixed-horizon interval to hold at all 14 looks breaks its 95%.
    assert effect_result.welch_all_peeks_coverage < 0.90
    # The confidence sequence is valid uniformly over the looks.
    assert effect_result.msprt_all_peeks_coverage >= 0.95 - 3 * se


def test_aa_coverage_is_one_minus_the_two_sided_reject_rate(aa_result) -> None:
    assert aa_result.welch_fixed_coverage == pytest.approx(1 - aa_result.ttest_fixed_reject_rate)
    assert aa_result.welch_all_peeks_coverage == pytest.approx(1 - aa_result.ttest_peek_reject_rate)


def test_same_seed_same_result_and_another_seed_differs(aa_result) -> None:
    assert simulate_peeking(AA) == aa_result
    other = simulate_peeking(replace(AA, seed=99))
    assert other.ttest_peek_reject_rate != aa_result.ttest_peek_reject_rate


def test_cumulative_looks_match_welch_on_the_raw_units() -> None:
    users = 5
    control = np.array([1, 3, 2])
    treatment = np.array([2, 2, 4])
    looks = cumulative_looks(control, treatment, users)
    for day in range(3):
        n = users * (day + 1)
        sc, st = control[: day + 1].sum(), treatment[: day + 1].sum()
        raw_c = np.r_[np.ones(sc), np.zeros(n - sc)]
        raw_t = np.r_[np.ones(st), np.zeros(n - st)]
        welch = welch_ttest(raw_c, raw_t)
        assert looks.estimate[day] == pytest.approx(welch.estimate, rel=1e-12)
        assert looks.variance[day] == pytest.approx(welch.se**2, rel=1e-12)
        assert looks.df[day] == pytest.approx(welch.df, rel=1e-12)
        assert looks.p_value[day] == pytest.approx(welch.p_value, rel=1e-9)
    assert looks.n_per_arm.tolist() == [5, 10, 15]


def test_cumulative_looks_treat_zero_variance_as_no_evidence() -> None:
    looks = cumulative_looks(np.array([0, 0]), np.array([0, 0]), 10)
    assert looks.p_value.tolist() == [1.0, 1.0]
    assert looks.estimate.tolist() == [0.0, 0.0]


@pytest.mark.parametrize(
    ("overrides", "match"),
    [
        ({"n_sims": 0}, "n_sims"),
        ({"days": 0}, "days"),
        ({"users_per_arm_per_day": 1}, "users_per_arm_per_day"),
        ({"baseline_rate": 0.0}, "baseline_rate"),
        ({"baseline_rate": 0.99, "effect": 0.02}, "effect"),
        ({"tau": 0.0}, "tau"),
        ({"alpha": 1.0}, "alpha"),
    ],
)
def test_config_rejects_bad_values(overrides, match) -> None:
    with pytest.raises(ValueError, match=match):
        PeekingConfig(**overrides)


def test_run_records_are_simulated_m1_and_m3_rows(aa_result, effect_result) -> None:
    records = to_run_records(aa_result, effect_result, pr="12", git_sha="abc123")
    by_metric = {r.metric: r for r in records}
    assert set(by_metric) == {
        "fpr_ttest_fixed_horizon",
        "fpr_ttest_daily_peek",
        "fpr_msprt_daily_peek",
        "ci95_coverage_welch_fixed_horizon",
        "ci95_coverage_welch_all_peeks",
        "cs95_coverage_msprt_all_peeks",
    }
    assert {r.metric_id for r in records if r.metric.startswith("fpr")} == {"M1"}
    assert {r.metric_id for r in records if "coverage" in r.metric} == {"M3"}
    assert all(r.simulated and r.n == N_SIMS and r.pr == "12" for r in records)
    assert by_metric["fpr_msprt_daily_peek"].value == aa_result.msprt_peek_reject_rate
    assert by_metric["cs95_coverage_msprt_all_peeks"].value == (
        effect_result.msprt_all_peeks_coverage
    )
    assert by_metric["fpr_ttest_daily_peek"].seed == "11"
    assert by_metric["ci95_coverage_welch_all_peeks"].seed == "12"
    assert all("virtual users" in r.notes and "mc_se=" in r.notes for r in records)


def test_main_appends_six_rows_and_dry_run_writes_nothing(tmp_path, capsys) -> None:
    runs_csv = tmp_path / "runs.csv"
    assert main(["--n-sims", "200", "--pr", "12", "--runs-csv", str(runs_csv), "--dry-run"]) == 0
    assert not runs_csv.exists()
    assert "fpr_msprt_daily_peek" in capsys.readouterr().out
    assert main(["--n-sims", "200", "--pr", "12", "--runs-csv", str(runs_csv)]) == 0
    rows = read_runs(runs_csv)
    assert len(rows) == 6
    assert all(r.n == 200 and r.simulated for r in rows)
