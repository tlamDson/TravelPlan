"""PR 16 run: Locust virtual users -> real ingest -> Mongo -> daily export -> abkit, end to end.

Needs ``docker compose up -d mongodb redis`` and the ``[load]`` extra. The driver drops and
refills a local ``travelplan_sim`` database, boots the backend itself (dummy keys,
``ANALYTICS_SIM_INGEST=true``), replays every SIMULATED virtual user's events through
``POST /api/analytics/sim/events`` with Locust, exports each day with the backend's
``analytics:export`` script, and checks that

- every count agrees: sent, ingest answers, documents stored, rows exported, and the fault
  manifest (``received = sent``, ``accepted = sent - duplicates - quarantined``);
- abkit's readout on the export equals the readout on the simulated events themselves.

Appends ``simulated=true`` rows to ``analytics/runs/runs.csv`` (M9a shares, reconciliation,
readout, throughput); exit code 1 if any check fails.

    python -m simkit.driver --users 1000 --vus 1000 [--duplicate 500] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import secrets
import tempfile
import time
from collections.abc import Sequence
from datetime import UTC, date, datetime
from pathlib import Path

from abkit.bench import _git_sha
from abkit.runs import RUNS_CSV_PATH, RunRecord, append_run

from simkit.driver.analysis import (
    DEFAULT_EXPERIMENT,
    EndToEnd,
    Prepared,
    analyze,
    export_days,
    prepare,
)
from simkit.driver.client import Tally
from simkit.driver.exported import read_export
from simkit.driver.plan import write_plan
from simkit.driver.reconcile import Reconciliation, reconcile
from simkit.driver.stack import (
    backend_env,
    check_local_mongo_uri,
    export_day,
    mongo_counts,
    reset_sim_db,
    run_locust,
    sim_mongo_uri,
    start_backend,
    wait_healthy,
    wait_unique_event_index,
)
from simkit.faults import FAULT_TYPES

__all__ = [
    "DEFAULT_EXPERIMENT",
    "analyze",
    "build_parser",
    "export_days",
    "main",
    "prepare",
    "to_run_records",
]

DEFAULT_START = date(2026, 11, 1)
PR = "16"


def _share(part: int, whole: int) -> float:
    return part / whole if whole else 0.0


def to_run_records(
    prepared: Prepared,
    tally: Tally,
    rec: Reconciliation,
    e2e: EndToEnd,
    *,
    vus: int,
    load_seconds: float,
    run_at: str,
    git_sha: str,
    pr: str = PR,
) -> list[RunRecord]:
    p95 = tally.latency_ms(0.95)
    notes = (
        f"virtual users={prepared.users} (simulated) locust_vus={vus} days={prepared.days} "
        f"start={prepared.start.isoformat()} sent={prepared.sent} batches={tally.batches} "
        f"retries={tally.retries} failed_batches={tally.failed_batches} "
        f"experiment={prepared.experiment.definition.key} path=locust->POST /api/analytics/sim/"
        f"events->mongo->analytics:export->abkit"
    )
    readout = e2e.exported
    readout_notes = (
        f"{notes}; window_days={prepared.window_days} metric=mean saves/user "
        f"verdict={readout.verdict} p={readout.primary.p_value:.4g} "
        f"same_table_as_simulated_events={e2e.same_table}"
    )
    seed = str(prepared.seed)
    rows = [
        (
            "M9a",
            "sim_driver_schema_invalid_share",
            _share(tally.quarantined, tally.received),
            "share",
            tally.received,
            notes,
        ),
        (
            "M9a",
            "sim_driver_duplicate_share",
            _share(tally.duplicates, tally.received),
            "share",
            tally.received,
            notes,
        ),
        (
            "e2e",
            "sim_driver_reconcile_failures",
            len(rec.failures()),
            "checks",
            len(rec.checks),
            notes,
        ),
        (
            "e2e",
            "sim_driver_readout_estimate",
            readout.primary.estimate,
            "saves/user",
            e2e.n_users,
            readout_notes,
        ),
        (
            "e2e",
            "sim_driver_readout_estimate_abs_diff",
            e2e.estimate_abs_diff,
            "saves/user",
            e2e.n_users,
            readout_notes,
        ),
        (
            "bench",
            "sim_driver_ingest_throughput",
            tally.received / load_seconds if load_seconds > 0 else 0.0,
            "events/s",
            tally.received,
            notes,
        ),
    ]
    if p95 is not None:
        rows.append(("bench", "sim_driver_batch_latency_p95", p95, "ms", tally.batches, notes))
    return [
        RunRecord(run_at, git_sha, pr, mid, metric, float(value), unit, n, seed, True, note)
        for mid, metric, value, unit, n, note in rows
    ]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="simkit.driver", description=__doc__.splitlines()[0])
    parser.add_argument("--users", type=int, default=1000, help="simulated virtual users")
    parser.add_argument("--vus", type=int, default=1000, help="concurrent Locust users")
    parser.add_argument("--spawn-rate", type=float, default=100.0, help="Locust users/s")
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--window-days", type=int, default=7)
    parser.add_argument("--start", type=date.fromisoformat, default=DEFAULT_START)
    parser.add_argument("--seed", type=int, default=16)
    parser.add_argument("--experiment", type=Path, help="experiment config JSON (camelCase)")
    for fault in FAULT_TYPES:
        parser.add_argument(f"--{fault.replace('_', '-')}", dest=fault, type=int, default=0)
    parser.add_argument("--mongo-uri", default=sim_mongo_uri(), help="local travelplan_sim* db")
    parser.add_argument("--port", type=int, default=3100, help="port of the backend it boots")
    parser.add_argument("--run-time", default="30m", help="Locust safety cap")
    parser.add_argument("--work-dir", type=Path, help="plan, tally, export, logs (default: tmp)")
    parser.add_argument("--pr", default=PR)
    parser.add_argument("--runs-csv", type=Path, default=RUNS_CSV_PATH)
    parser.add_argument("--dry-run", action="store_true", help="print the rows, do not append")
    return parser


def _load(args, prepared: Prepared, work: Path) -> tuple[Tally, float, tuple[int, int], list]:
    """Boot the backend, replay with Locust, count in Mongo, export every day."""
    env = backend_env(args.mongo_uri, args.port, secrets.token_hex(32))
    host = f"http://127.0.0.1:{args.port}"
    plan, tally_path = work / "plan.json", work / "tally.json"
    write_plan(prepared.scripts, plan)
    reset_sim_db(args.mongo_uri)
    backend = start_backend(env, work / "backend.log")
    try:
        wait_healthy(host, backend)
        wait_unique_event_index(args.mongo_uri)
        started = time.perf_counter()
        proc = run_locust(
            plan, tally_path, host, vus=args.vus, spawn_rate=args.spawn_rate, run_time=args.run_time
        )
        load_seconds = time.perf_counter() - started
    finally:
        backend.terminate()
        backend.wait(timeout=30)
    (work / "locust.log").write_text(proc.stdout + proc.stderr, encoding="utf-8")
    tally = Tally.from_dict(json.loads(tally_path.read_text(encoding="utf-8")))
    counts = mongo_counts(args.mongo_uri)
    out = work / "export"
    for day in export_days(prepared.accepted_events):
        export_day(day, out, env)
    return tally, load_seconds, counts, read_export(out)


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        check_local_mongo_uri(args.mongo_uri)
        raw = DEFAULT_EXPERIMENT
        if args.experiment is not None:
            raw = json.loads(args.experiment.read_text(encoding="utf-8"))
        prepared = prepare(
            users=args.users,
            days=args.days,
            seed=args.seed,
            start=args.start,
            experiment=raw,
            faults={f: getattr(args, f) for f in FAULT_TYPES},
            window_days=args.window_days,
        )
    except (ValueError, OSError) as exc:
        parser.error(str(exc))

    work = args.work_dir or Path(tempfile.mkdtemp(prefix="simkit-driver-"))
    work.mkdir(parents=True, exist_ok=True)
    tally, load_seconds, (stored, quarantined), rows = _load(args, prepared, work)
    rec = reconcile(
        sent=prepared.sent,
        expected=prepared.expected,
        tally=tally,
        stored_events=stored,
        stored_quarantine=quarantined,
        accepted_ids=prepared.accepted_ids,
        exported_ids=[r["eventId"] for r in rows],
    )
    e2e = analyze(prepared, rows)
    for name, (expected, actual) in rec.checks.items():
        print(f"{'ok  ' if expected == actual else 'FAIL'} {name}: {expected} vs {actual}")
    print(f"{'ok  ' if e2e.same_table else 'FAIL'} export table = simulated-events table")
    records = to_run_records(
        prepared,
        tally,
        rec,
        e2e,
        vus=args.vus,
        load_seconds=load_seconds,
        run_at=datetime.now(UTC).isoformat(timespec="seconds"),
        git_sha=_git_sha(),
        pr=args.pr,
    )
    for record in records:
        if not args.dry_run:
            append_run(record, args.runs_csv)
        print(f"{record.metric_id} {record.metric}={record.value:.6g} {record.unit}")
    print(f"work dir: {work}")
    return 0 if rec.ok and e2e.same_table else 1
