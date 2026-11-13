"""M8: incremental conversions at the same budget, LP versus top-k, T- and X-learner."""

from pathlib import Path

import numpy as np
import pytest
from criteo_fixtures import criteo_like_rows, write_criteo_like

from abkit.criteo import CriteoSample, save_sample
from abkit.runs import read_runs
from abkit.uplift.m8 import BUDGET_SHARES, PolicyOutcome, evaluate_seed, main, summarize


def _sample(n: int = 30_000, seed: int = 0) -> CriteoSample:
    rows = criteo_like_rows(n, seed)
    return CriteoSample(
        features=rows[:, :12].astype(np.float32),
        treatment=rows[:, 12].astype(np.int8),
        conversion=rows[:, 13].astype(np.int8),
        visit=rows[:, 14].astype(np.int8),
        exposure=rows[:, 15].astype(np.int8),
        fraction=1.0,
        seed=seed,
        source_rows=n,
        source_sha256="0" * 64,
    )


@pytest.fixture(scope="module")
def outcomes() -> list[PolicyOutcome]:
    return evaluate_seed(_sample(), seed=3)


def test_default_budgets_are_ten_twenty_thirty_percent_of_treating_everyone() -> None:
    assert BUDGET_SHARES == (0.1, 0.2, 0.3)


def test_one_outcome_per_learner_and_budget(outcomes: list[PolicyOutcome]) -> None:
    keys = [(o.learner, o.budget_share) for o in outcomes]
    assert keys == [(lr, b) for lr in ("t", "x") for b in BUDGET_SHARES]
    for o in outcomes:
        assert o.seed == 3
        assert 8_000 < o.n_test < 10_000  # 30% held out
        assert o.n_test == outcomes[0].n_test


def test_both_policies_spend_at_most_the_budget_and_lp_plans_at_least_top_k(
    outcomes: list[PolicyOutcome],
) -> None:
    for o in outcomes:
        assert o.topk_planned_cost <= o.budget * (1 + 1e-9)
        assert o.lp_planned_cost <= o.budget * (1 + 1e-9)
        # top-k is feasible for the LP, so the LP's planned uplift can only be higher.
        assert o.lp_planned_uplift >= o.topk_planned_uplift - 1e-9
        assert 0 < o.topk_treated <= o.n_test and 0 < o.lp_treated <= o.n_test
        for value in (o.topk_value, o.lp_value, o.random_value, o.topk_spend, o.lp_spend):
            assert np.isfinite(value)


def test_random_targeting_gets_the_budget_share_of_the_average_effect(
    outcomes: list[PolicyOutcome],
) -> None:
    by_budget = {o.budget_share: o.random_value for o in outcomes if o.learner == "t"}
    assert by_budget[0.2] == pytest.approx(2 * by_budget[0.1])
    assert by_budget[0.3] == pytest.approx(3 * by_budget[0.1])


def test_the_same_seed_gives_the_same_outcomes(outcomes: list[PolicyOutcome]) -> None:
    again = evaluate_seed(_sample(), seed=3)
    assert again == outcomes
    other = evaluate_seed(_sample(), seed=4, budget_shares=(0.1,), learners=("t",))
    assert other[0].lp_value != outcomes[0].lp_value


def test_summarize_writes_three_m8_rows_per_learner_and_budget(
    outcomes: list[PolicyOutcome],
) -> None:
    more = outcomes + evaluate_seed(_sample(), seed=4)
    records = summarize(more, git_sha="abc", pr="20", run_at="2026-11-13T00:00:00+00:00")
    assert len(records) == 2 * 3 * 3
    assert {r.metric_id for r in records} == {"M8"}
    assert all(r.simulated is False for r in records)  # Criteo users are real
    assert {r.seed for r in records} == {"3,4"}
    by_name = {r.metric: r for r in records}
    topk = by_name["m8_incremental_conversions_per_100k_topk_t_b10"]
    lp = by_name["m8_incremental_conversions_per_100k_lp_t_b10"]
    gain = by_name["m8_lp_gain_over_topk_t_b10"]
    pair = [o for o in more if o.learner == "t" and o.budget_share == 0.1]

    def per_100k(attr: str) -> float:
        return float(np.mean([getattr(o, attr) / o.n_test * 1e5 for o in pair]))

    assert topk.value == pytest.approx(per_100k("topk_value"), abs=1e-3)
    assert lp.value == pytest.approx(per_100k("lp_value"), abs=1e-3)
    assert gain.value == pytest.approx((lp.value - topk.value) / abs(topk.value) * 100, abs=0.01)
    assert gain.unit == "%" and topk.unit == "conversions/100k users"
    assert "seeds=2" in gain.notes and "random=" in gain.notes


def test_main_dry_run_prints_rows_without_appending(tmp_path: Path, capsys) -> None:
    npz = save_sample(_sample(12_000), tmp_path / "s.npz")
    runs = tmp_path / "runs.csv"
    code = main(
        ["--sample", str(npz), "--seeds", "0", "--budgets", "0.2", "--runs-csv", str(runs)]
        + ["--dry-run"]
    )
    assert code == 0
    assert not runs.exists()
    lines = capsys.readouterr().out.splitlines()
    assert len([line for line in lines if line.startswith("m8_")]) == 2 * 3


def test_main_draws_the_sample_from_the_raw_file_and_appends(tmp_path: Path) -> None:
    raw = write_criteo_like(tmp_path / "c.csv.gz", n=20_000, seed=5)
    runs = tmp_path / "runs.csv"
    saved = tmp_path / "sample.npz"
    argv = ["--raw", str(raw), "--fraction", "0.5", "--no-checksum", "--save-sample", str(saved)]
    argv += ["--seeds", "0,1", "--budgets", "0.1,0.3", "--learners", "x", "--pr", "20"]
    assert main([*argv, "--runs-csv", str(runs)]) == 0
    records = read_runs(runs)
    assert len(records) == 2 * 3
    assert {r.pr for r in records} == {"20"}
    assert saved.is_file()
    assert "fraction=0.5" in records[0].notes


def test_main_exits_two_on_a_missing_file(tmp_path: Path, capsys) -> None:
    assert main(["--sample", str(tmp_path / "nope.npz"), "--dry-run"]) == 2
    assert "abkit.uplift" in capsys.readouterr().err
