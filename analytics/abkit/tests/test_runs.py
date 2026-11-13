import csv
import math
from pathlib import Path

import pytest

from abkit.runs import RUNS_COLUMNS, RUNS_CSV_PATH, RunRecord, append_run, read_runs


def _record(**overrides: object) -> RunRecord:
    fields = {
        "run_at": "2026-11-13T00:00:00+00:00",
        "git_sha": "abc123",
        "pr": "9",
        "metric_id": "bench",
        "metric": "assignment_throughput",
        "value": 1234.5,
        "unit": "assignments/s",
        "n": 10000,
        "seed": "",
        "simulated": False,
        "notes": "repeats=3 median",
    }
    fields.update(overrides)
    return RunRecord(**fields)  # type: ignore[arg-type]


def test_runs_csv_lives_in_analytics_runs(repo_root: Path) -> None:
    assert repo_root / "analytics/runs/runs.csv" == RUNS_CSV_PATH


def test_committed_runs_csv_has_the_ledger_header() -> None:
    with RUNS_CSV_PATH.open(encoding="utf-8", newline="") as fh:
        header = next(csv.reader(fh))
    assert tuple(header) == RUNS_COLUMNS


def test_committed_runs_csv_rows_all_parse() -> None:
    for row in read_runs(RUNS_CSV_PATH):
        assert isinstance(row, RunRecord)


def test_append_run_creates_file_with_header(tmp_path: Path) -> None:
    path = tmp_path / "sub" / "runs.csv"
    append_run(_record(), path)
    lines = path.read_text(encoding="utf-8").splitlines()
    assert lines[0] == ",".join(RUNS_COLUMNS)
    assert len(lines) == 2


def test_append_run_round_trips_through_read_runs(tmp_path: Path) -> None:
    path = tmp_path / "runs.csv"
    first = _record()
    second = _record(metric="other", value=0.5, simulated=True, notes="has, comma")
    append_run(first, path)
    append_run(second, path)
    assert read_runs(path) == [first, second]


def test_append_run_refuses_a_file_with_another_header(tmp_path: Path) -> None:
    path = tmp_path / "runs.csv"
    path.write_text("a,b,c\n", encoding="utf-8")
    with pytest.raises(ValueError, match="header"):
        append_run(_record(), path)


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"metric": ""}, "metric"),
        ({"metric_id": ""}, "metric_id"),
        ({"value": math.nan}, "finite"),
        ({"value": math.inf}, "finite"),
        ({"n": -1}, "n"),
        ({"run_at": "yesterday"}, "run_at"),
        ({"run_at": "2026-11-13T00:00:00"}, "timezone"),
        ({"notes": "line\nbreak"}, "newline"),
    ],
)
def test_run_record_rejects_bad_values(overrides: dict, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        _record(**overrides)


def test_read_runs_rejects_a_malformed_row(tmp_path: Path) -> None:
    path = tmp_path / "runs.csv"
    append_run(_record(), path)
    with path.open("a", encoding="utf-8", newline="") as fh:
        fh.write("2026-11-13T00:00:00+00:00,sha,9,bench,m,not-a-number,u,1,,false,\n")
    with pytest.raises(ValueError, match="line 3"):
        read_runs(path)
