"""Write SIMULATED TravelPlan events, the per-user answer key and a manifest.

``python -m simkit.generate [--experiment experiment.json] [--duplicate N ...] [--parquet]``
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import date
from pathlib import Path

from simkit.experiment import parse_experiment
from simkit.export import write_jsonl, write_parquet
from simkit.faults import FAULT_TYPES, inject_faults
from simkit.generator import simulate

# analytics/data/ is git-ignored: never commit generated data.
DEFAULT_OUT = Path(__file__).resolve().parents[4] / "analytics/data/simulated"
DEFAULT_START = date(2026, 11, 1)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=42, help="random seed (default: 42)")
    parser.add_argument("--users", type=int, default=100, help="simulated users (default: 100)")
    parser.add_argument("--days", type=int, default=7, help="days of activity (default: 7)")
    parser.add_argument(
        "--start",
        type=date.fromisoformat,
        default=DEFAULT_START,
        help=f"first day, YYYY-MM-DD, UTC (default: {DEFAULT_START.isoformat()})",
    )
    parser.add_argument("--experiment", type=Path, help="experiment config JSON (camelCase)")
    for fault in FAULT_TYPES:
        parser.add_argument(
            f"--{fault.replace('_', '-')}",
            dest=fault,
            type=int,
            default=0,
            help=f"number of '{fault}' faults to plant (default: 0)",
        )
    parser.add_argument("--parquet", action="store_true", help="also write events.parquet")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    counts = {fault: getattr(args, fault) for fault in FAULT_TYPES}
    try:
        experiment = None
        if args.experiment is not None:
            experiment = parse_experiment(json.loads(args.experiment.read_text(encoding="utf-8")))
        sim = simulate(
            seed=args.seed,
            users=args.users,
            days=args.days,
            start=args.start,
            experiment=experiment,
        )
        result = inject_faults(sim.events, counts, seed=args.seed)
        if args.parquet and result.expected_ingest()["quarantined"]:
            raise ValueError("--parquet holds schema-valid events only; drop the quarantine faults")
    except (ValueError, OSError) as exc:
        parser.error(str(exc))

    manifest = {
        "simulated": True,
        "generator": "simkit (ported from RepoPulse)",
        "params": {
            "seed": args.seed,
            "users": args.users,
            "days": args.days,
            "start": args.start.isoformat(),
        },
        "experiment": experiment.to_dict() if experiment else None,
        "personas": dict(sorted(Counter(u.persona for u in sim.users).items())),
        "variants": dict(sorted(Counter(u.variant for u in sim.users if u.variant).items())),
        **result.manifest(),
    }
    args.out.mkdir(parents=True, exist_ok=True)
    write_jsonl(result.events, args.out / "events.jsonl")
    write_jsonl([u.to_dict() for u in sim.users], args.out / "users.jsonl")
    if args.parquet:
        write_parquet(result.events, args.out / "events.parquet")
    with open(args.out / "manifest.json", "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"{args.out} ({len(result.events)} simulated events, {len(result.faults)} faults)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
