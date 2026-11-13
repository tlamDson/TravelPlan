"""The PR 14 runner: M2 power, M5 persona bias and CATE rows for runs.csv."""

import math

import pytest
from abkit.runs import read_runs
from abkit.stats import sample_size_proportions

from simkit.validation_run import (
    DEFAULT_SEED,
    N_RUNS,
    SIZES,
    main,
    run_validation,
    to_run_records,
)
from simkit.validation_sim import build_scenario

SCENARIO = build_scenario()
PER_SIZE = {
    "M2": ["power_welch", "power_analytic", "fpr_aa_welch"],
    "M5": [
        "bias_ate_pp",
        "ci95_coverage_ate",
        *(f"bias_cate_{p}_pp" for p in SCENARIO.names),
        *(f"ci95_coverage_cate_{p}" for p in SCENARIO.names),
    ],
    "CATE": [
        *(f"rmse_cate_{p}_pp" for p in SCENARIO.names),
        "cate_heterogeneity_power",
        "cate_heterogeneity_fpr_aa",
        "cate_rank_accuracy",
    ],
}


@pytest.fixture(scope="module")
def results():
    return run_validation(SCENARIO, sizes=(1000, 2000), n_runs=40, seed=3)


def test_defaults_are_the_planned_run() -> None:
    assert SIZES == (1000, 5000, 50_000)
    assert N_RUNS == 1000
    assert isinstance(DEFAULT_SEED, int)


def test_one_effect_and_one_aa_summary_per_size(results) -> None:
    assert [r.n_users for r in results] == [1000, 2000]
    for r in results:
        assert r.effect.n_users == r.aa.n_users == r.n_users
        assert r.effect.n_runs == r.aa.n_runs == 40
        assert r.aa.rank_accuracy is None


def test_records_cover_every_metric_of_every_size(results) -> None:
    records = to_run_records(results, SCENARIO, pr="14", git_sha="abc123", seed=3)
    expected = {"n_per_arm_80pct_power"}
    for size in (1000, 2000):
        for metrics in PER_SIZE.values():
            expected |= {f"{m}_n{size}" for m in metrics}
    assert {r.metric for r in records} == expected
    assert len(records) == len(expected)
    for metric_id, metrics in PER_SIZE.items():
        ids = {r.metric_id for r in records if any(r.metric.startswith(m) for m in metrics)}
        assert ids == {metric_id}
    assert all(r.simulated and r.pr == "14" and r.git_sha == "abc123" for r in records)
    assert all("virtual users" in r.notes and "mc_se=" in r.notes for r in records)


def test_record_values_come_from_the_summaries(results) -> None:
    by = {r.metric: r for r in to_run_records(results, SCENARIO, pr="14", git_sha="x", seed=3)}
    small = results[0]
    assert by["power_welch_n1000"].value == small.effect.reject_rate
    assert by["power_analytic_n1000"].value == small.effect.analytic_power
    assert by["fpr_aa_welch_n1000"].value == small.aa.reject_rate
    assert by["fpr_aa_welch_n1000"].seed == "4"  # A/A runs use seed + 1
    assert by["power_welch_n1000"].seed == "3"
    assert by["bias_ate_pp_n1000"].value == pytest.approx(100 * small.effect.ate_bias)
    assert by["bias_ate_pp_n1000"].unit == "pp"
    planner = SCENARIO.names.index("planner")
    assert by["rmse_cate_planner_pp_n1000"].value == pytest.approx(
        100 * small.effect.cate_rmse[planner]
    )
    assert by["cate_heterogeneity_fpr_aa_n1000"].value == small.aa.heterogeneity_reject_rate
    assert by["cate_rank_accuracy_n1000"].value == small.effect.rank_accuracy
    assert all(by[f"{m}_n1000"].n == 40 for m in PER_SIZE["M2"])
    needed = sample_size_proportions(SCENARIO.p_control_all, SCENARIO.p_treatment_all).nobs1
    assert by["n_per_arm_80pct_power"].value == math.ceil(needed)
    assert by["n_per_arm_80pct_power"].unit == "users"


def test_notes_state_the_injected_effect(results) -> None:
    notes = to_run_records(results, SCENARIO, pr="14", git_sha="x", seed=3)[0].notes
    assert "relative_lift=0.03" in notes
    for name in SCENARIO.names:
        assert f"{name}=" in notes


def test_main_dry_run_prints_and_writes_nothing(tmp_path, capsys) -> None:
    runs_csv = tmp_path / "runs.csv"
    argv = ["--sizes", "1000", "--n-runs", "20", "--pr", "14", "--runs-csv", str(runs_csv)]
    assert main([*argv, "--dry-run"]) == 0
    assert not runs_csv.exists()
    assert "power_welch_n1000" in capsys.readouterr().out
    assert main(argv) == 0
    rows = read_runs(runs_csv)
    assert len(rows) == 1 + sum(len(m) for m in PER_SIZE.values())
    assert all(r.simulated for r in rows)
