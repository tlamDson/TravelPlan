"""``abkit decide export | label | kappa`` (exit 0 on success, 2 on bad input)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from abkit.labeling.agreement import agreement, to_run_records
from abkit.labeling.export import DECIDE_ROOT, LABELS_FILE, export_blinded
from abkit.labeling.session import label_session
from abkit.runs import RUNS_CSV_PATH, append_run

_GOLDEN_LATEST = Path(__file__).resolve().parents[4] / "golden/v2"


def _labels(args: argparse.Namespace) -> Path:
    return args.labels if args.labels is not None else args.dir / LABELS_FILE


def _export(args: argparse.Namespace) -> int:
    key = export_blinded(args.golden, args.out, force=args.force)
    print(f"wrote {len(key['readouts'])} blinded readouts to {args.out}")
    return 0


def _label(args: argparse.Namespace) -> int:
    label_session(args.dir, _labels(args))
    return 0


def _kappa(args: argparse.Namespace) -> int:
    result = agreement(args.dir, _labels(args), partial=args.partial)
    print(result.format())
    if args.record:
        for record in to_run_records(result, rater=args.rater):
            append_run(record, args.runs_csv)
    return 0


def _run(handler):
    def run(args: argparse.Namespace) -> int:
        try:
            return handler(args)
        except (ValueError, OSError) as err:
            print(f"abkit decide: {err}", file=sys.stderr)
            return 2

    return run


def add_decide(commands) -> None:
    decide = commands.add_parser("decide", help="G-decide: blinded readouts, labels, kappa")
    sub = decide.add_subparsers(dest="decide_command", required=True)
    export = sub.add_parser("export", help="write the blinded readouts and their key")
    export.add_argument("--golden", type=Path, default=_GOLDEN_LATEST)
    export.add_argument("--out", type=Path, default=DECIDE_ROOT)
    export.add_argument("--force", action="store_true", help="replace an earlier export")
    export.set_defaults(handler=_run(_export))
    for name, handler, text in (
        ("label", _label, "label the blinded readouts one by one"),
        ("kappa", _kappa, "Cohen's kappa of the labels vs the memo and the p-only baseline"),
    ):
        cmd = sub.add_parser(name, help=text)
        cmd.add_argument("dir", nargs="?", type=Path, default=DECIDE_ROOT)
        cmd.add_argument("--labels", type=Path, default=None, help="default: DIR/labels.csv")
        cmd.set_defaults(handler=_run(handler))
        if name == "kappa":
            cmd.add_argument("--partial", action="store_true", help="allow unlabelled readouts")
            cmd.add_argument("--record", action="store_true", help="append M11 rows to runs.csv")
            cmd.add_argument("--runs-csv", type=Path, default=RUNS_CSV_PATH)
            cmd.add_argument("--rater", default="Lam", help="rater label written to the M11 notes")
