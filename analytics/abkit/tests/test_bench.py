from pathlib import Path

import pytest

from abkit.bench import BENCHMARKS, main, run_benchmark
from abkit.runs import read_runs


def test_assignment_benchmark_is_registered() -> None:
    assert "assignment" in BENCHMARKS


def test_run_benchmark_measures_assignment_throughput() -> None:
    record = run_benchmark("assignment", repeats=1, pr="9", git_sha="deadbeef")
    assert record.metric == "assignment_throughput"
    assert record.unit == "assignments/s"
    assert record.n == 10_000
    assert record.value > 0
    assert record.simulated is False
    assert record.git_sha == "deadbeef"
    assert "repeats=1" in record.notes


def test_run_benchmark_rejects_unknown_names() -> None:
    with pytest.raises(KeyError, match="nope"):
        run_benchmark("nope", repeats=1)


def test_run_benchmark_rejects_zero_repeats() -> None:
    with pytest.raises(ValueError, match="repeats"):
        run_benchmark("assignment", repeats=0)


def test_main_appends_one_row_to_the_given_ledger(tmp_path: Path, capsys) -> None:
    path = tmp_path / "runs.csv"
    code = main(["assignment", "--repeats", "1", "--pr", "9", "--runs-csv", str(path)])
    assert code == 0
    rows = read_runs(path)
    assert len(rows) == 1
    assert rows[0].metric == "assignment_throughput"
    assert rows[0].pr == "9"
    assert "assignment_throughput" in capsys.readouterr().out


def test_main_dry_run_writes_nothing(tmp_path: Path) -> None:
    path = tmp_path / "runs.csv"
    assert main(["assignment", "--repeats", "1", "--dry-run", "--runs-csv", str(path)]) == 0
    assert not path.exists()
