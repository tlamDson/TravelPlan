"""M8 with a zero top-k baseline: the relative gain is undefined, the other rows still count."""

import warnings
from pathlib import Path

import pytest

from abkit.runs import read_runs
from abkit.uplift import m8
from abkit.uplift.m8 import PolicyOutcome, summarize

RUN_AT = "2026-11-13T00:00:00+00:00"


def _outcome(seed: int, topk_value: float, lp_value: float) -> PolicyOutcome:
    return PolicyOutcome(
        seed=seed,
        learner="t",
        budget_share=0.1,
        n_test=10_000,
        budget=100.0,
        topk_planned_uplift=1.0,
        topk_planned_cost=90.0,
        topk_treated=200,
        topk_value=topk_value,
        topk_spend=95.0,
        lp_planned_uplift=1.2,
        lp_planned_cost=99.0,
        lp_treated=240,
        lp_value=lp_value,
        lp_spend=98.0,
        random_value=0.5,
    )


def _summarize(outcomes: list[PolicyOutcome]) -> dict:
    with warnings.catch_warnings():
        warnings.simplefilter("error")  # no divide-by-zero RuntimeWarning either
        records = summarize(outcomes, git_sha="abc", pr="20", run_at=RUN_AT)
    return {r.metric: r for r in records}


def test_zero_mean_top_k_keeps_both_value_rows_and_drops_only_the_gain() -> None:
    by_name = _summarize([_outcome(0, 0.0, 2.0), _outcome(1, 0.0, 3.0)])
    assert set(by_name) == {
        "m8_incremental_conversions_per_100k_topk_t_b10",
        "m8_incremental_conversions_per_100k_lp_t_b10",
    }
    assert by_name["m8_incremental_conversions_per_100k_topk_t_b10"].value == 0.0
    assert by_name["m8_incremental_conversions_per_100k_lp_t_b10"].value == pytest.approx(25.0)
    notes = by_name["m8_incremental_conversions_per_100k_lp_t_b10"].notes
    assert "gain undefined: top-k baseline is 0" in notes


def test_one_zero_seed_leaves_the_mean_gain_and_marks_that_seed() -> None:
    by_name = _summarize([_outcome(0, 0.0, 1.0), _outcome(1, 4.0, 5.0)])
    gain = by_name["m8_lp_gain_over_topk_t_b10"]
    # means per 100k: top-k 20, LP 30
    assert gain.value == pytest.approx(50.0)
    assert "gain_per_seed=[n/a 25.0]" in gain.notes


def test_main_appends_the_valid_rows_when_top_k_is_zero(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_evaluate(sample, seed, budgets, learners, test_share):
        return [_outcome(seed, 0.0, 2.0)]

    class FakeSample:
        fraction, seed, source_rows, source_sha256 = 1.0, 0, 10, "0" * 64

        def __len__(self) -> int:
            return 10

    monkeypatch.setattr(m8, "load_sample", lambda path: FakeSample())
    monkeypatch.setattr(m8, "evaluate_seed", fake_evaluate)
    runs = tmp_path / "runs.csv"
    code = m8.main(["--sample", str(tmp_path / "s.npz"), "--seeds", "0", "--runs-csv", str(runs)])
    assert code == 0
    assert [r.metric for r in read_runs(runs)] == [
        "m8_incremental_conversions_per_100k_topk_t_b10",
        "m8_incremental_conversions_per_100k_lp_t_b10",
    ]
