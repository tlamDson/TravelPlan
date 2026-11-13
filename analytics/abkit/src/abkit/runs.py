"""The ``analytics/runs/runs.csv`` ledger.

Every number quoted in a README must come from a row here (CLAUDE.md, honest
numbers). ``simulated`` marks rows measured on simulated / virtual users so
they are never counted with real ones.
"""

from __future__ import annotations

import csv
import math
from dataclasses import astuple, dataclass, fields
from datetime import datetime
from pathlib import Path

RUNS_CSV_PATH = Path(__file__).resolve().parents[3] / "runs/runs.csv"


@dataclass(frozen=True)
class RunRecord:
    run_at: str
    git_sha: str
    pr: str
    metric_id: str
    metric: str
    value: float
    unit: str
    n: int
    seed: str
    simulated: bool
    notes: str

    def __post_init__(self) -> None:
        try:
            parsed = datetime.fromisoformat(self.run_at)
        except (TypeError, ValueError) as err:
            raise ValueError(f"run_at must be ISO 8601, got {self.run_at!r}") from err
        if parsed.tzinfo is None:
            raise ValueError(f"run_at needs a timezone offset, got {self.run_at!r}")
        for name in ("metric_id", "metric", "git_sha"):
            if not getattr(self, name):
                raise ValueError(f"{name} must not be empty")
        if not isinstance(self.value, int | float) or not math.isfinite(self.value):
            raise ValueError(f"value must be a finite number, got {self.value!r}")
        if isinstance(self.n, bool) or not isinstance(self.n, int) or self.n < 0:
            raise ValueError(f"n must be a non-negative integer, got {self.n!r}")
        if not isinstance(self.simulated, bool):
            raise ValueError(f"simulated must be a bool, got {self.simulated!r}")
        for f in fields(self):
            value = getattr(self, f.name)
            if isinstance(value, str) and ("\n" in value or "\r" in value):
                raise ValueError(f"{f.name} must not contain a newline")


RUNS_COLUMNS: tuple[str, ...] = tuple(f.name for f in fields(RunRecord))


def _to_cells(record: RunRecord) -> list[str]:
    cells = []
    for value in astuple(record):
        if isinstance(value, bool):
            cells.append("true" if value else "false")
        else:
            cells.append(repr(value) if isinstance(value, float) else str(value))
    return cells


def _from_cells(cells: list[str]) -> RunRecord:
    row = dict(zip(RUNS_COLUMNS, cells, strict=True))
    if row["simulated"] not in ("true", "false"):
        raise ValueError(f"simulated must be true/false, got {row['simulated']!r}")
    return RunRecord(
        **{
            **row,
            "value": float(row["value"]),
            "n": int(row["n"]),
            "simulated": row["simulated"] == "true",
        }
    )


def _check_header(path: Path) -> None:
    with path.open(encoding="utf-8", newline="") as fh:
        header = next(csv.reader(fh), None)
    if header is None or tuple(header) != RUNS_COLUMNS:
        raise ValueError(f"{path}: header {header!r} is not {list(RUNS_COLUMNS)!r}")


def append_run(record: RunRecord, path: Path = RUNS_CSV_PATH) -> None:
    """Append one row, writing the header first if the file is new or empty."""
    path = Path(path)
    is_new = not path.exists() or path.stat().st_size == 0
    if not is_new:
        _check_header(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        if is_new:
            writer.writerow(RUNS_COLUMNS)
        writer.writerow(_to_cells(record))


def read_runs(path: Path = RUNS_CSV_PATH) -> list[RunRecord]:
    """Parse every row; a malformed one raises with its line number."""
    path = Path(path)
    _check_header(path)
    records = []
    with path.open(encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh)
        next(reader)
        for cells in reader:
            try:
                records.append(_from_cells(cells))
            except (TypeError, ValueError) as err:
                raise ValueError(f"{path}: line {reader.line_num}: {err}") from err
    return records
