"""Run a named benchmark and append its result to ``analytics/runs/runs.csv``.

    python -m abkit.bench assignment --pr 9 [--repeats 5] [--dry-run]

Each benchmark returns ``(metric, value, unit, n, simulated, notes)``; the
reported value is the median over ``--repeats`` runs.
"""

from __future__ import annotations

import argparse
import statistics
import subprocess
import sys
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from abkit.assignment import assign_variant, load_vectors
from abkit.runs import RUNS_CSV_PATH, RunRecord, append_run


@dataclass(frozen=True)
class Benchmark:
    metric: str
    unit: str
    simulated: bool
    #: One timed run; returns (seconds, n items processed).
    run_once: Callable[[], tuple[float, int]]


def _assignment_once() -> tuple[float, int]:
    fixture = load_vectors()
    start = time.perf_counter()
    mismatches = sum(
        assign_variant(fixture.experiments[v.experiment_key], v.user_id) != (v.bucket, v.variant)
        for v in fixture.vectors
    )
    elapsed = time.perf_counter() - start
    if mismatches:
        raise RuntimeError(f"{mismatches} assignment vectors do not match")
    return elapsed, len(fixture.vectors)


BENCHMARKS: dict[str, Benchmark] = {
    "assignment": Benchmark(
        metric="assignment_throughput",
        unit="assignments/s",
        simulated=False,
        run_once=_assignment_once,
    ),
}


def _git_sha() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True, timeout=10
        )
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    return out.stdout.strip() or "unknown"


def run_benchmark(
    name: str, repeats: int = 5, pr: str = "", git_sha: str | None = None
) -> RunRecord:
    if name not in BENCHMARKS:
        raise KeyError(f"unknown benchmark {name!r}; known: {sorted(BENCHMARKS)}")
    if repeats < 1:
        raise ValueError(f"repeats must be >= 1, got {repeats}")
    bench = BENCHMARKS[name]
    timings = [bench.run_once() for _ in range(repeats)]
    n = timings[0][1]
    seconds = statistics.median(t for t, _ in timings)
    return RunRecord(
        run_at=datetime.now(UTC).isoformat(timespec="seconds"),
        git_sha=git_sha or _git_sha(),
        pr=pr,
        metric_id="bench",
        metric=bench.metric,
        value=round(n / seconds, 1),
        unit=bench.unit,
        n=n,
        seed="",
        simulated=bench.simulated,
        notes=f"benchmark={name} repeats={repeats} median python={sys.version.split()[0]}",
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="abkit.bench", description=__doc__.splitlines()[0])
    parser.add_argument("name", choices=sorted(BENCHMARKS))
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--pr", default="")
    parser.add_argument("--runs-csv", type=Path, default=RUNS_CSV_PATH)
    parser.add_argument("--dry-run", action="store_true", help="print the row, do not append it")
    args = parser.parse_args(argv)
    record = run_benchmark(args.name, repeats=args.repeats, pr=args.pr)
    if not args.dry_run:
        append_run(record, args.runs_csv)
    print(f"{record.metric}={record.value} {record.unit} (n={record.n}, {record.notes})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
