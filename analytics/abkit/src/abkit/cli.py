"""``abkit`` command line (also ``python -m abkit``).

    abkit golden [ROOT] [--strict] [--subset NAME]
    abkit readout PATH [--params JSON] [--simulated | --real] [--out FILE]
    abkit gate [ROOT] [--full] [--record [--pr PR] [--runs-csv PATH]]
    abkit decide export|label|kappa  (G-decide, see abkit/labeling)
    abkit actions-panel --cache DIR [--n 400 --seed 18 --record]  (see abkit/actions)

``golden`` exit codes: 0 every case passes (MISSING allowed unless ``--strict``),
1 a case fails, errors, or is MISSING under ``--strict``, 2 malformed dataset.
``readout`` prints the one-page memo of a readout case directory or a CSV (exit 0,
also when SRM blocks the conclusion) and exits 2 on bad input.
``gate`` (B2 plan, PR 15a, M10) runs ``golden --strict`` on the clean engine and on each of
the 10 planted mutants (``abkit/golden/mutants.py``), on the ``ci-fast`` subset unless
``--full``: exit 0 the clean engine passes and every mutant is blocked, 1 a mutant
survived, 2 the clean engine fails or a mutant crashed before any case ran.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from abkit.actions.cli import add_actions_panel
from abkit.bench import _git_sha
from abkit.golden.case import GoldenFormatError
from abkit.golden.gate import GATE_SUBSET, m10_records, run_gate
from abkit.golden.runner import run_golden
from abkit.labeling.cli import add_decide
from abkit.readout.inputs import load_readout_input
from abkit.runs import RUNS_CSV_PATH, append_run

DEFAULT_GOLDEN_ROOT = Path(__file__).resolve().parents[3] / "golden/v2"


def _golden(args: argparse.Namespace) -> int:
    try:
        report = run_golden(args.root, subset=args.subset)
    except GoldenFormatError as err:
        print(f"abkit golden: {err}", file=sys.stderr)
        return 2
    print(report.format())
    return 0 if report.ok(strict=args.strict) else 1


def _readout(args: argparse.Namespace) -> int:
    try:
        memo = load_readout_input(args.path, args.params, args.simulated).memo()
    except (ValueError, OSError) as err:
        print(f"abkit readout: {err}", file=sys.stderr)
        return 2
    if args.out is None:
        print(memo, end="")
    else:
        args.out.write_text(memo, encoding="utf-8")
    return 0


def _add_readout(commands) -> None:
    readout = commands.add_parser("readout", help="one-page readout memo of an experiment")
    readout.add_argument("path", type=Path, help="a readout case directory, or a .csv")
    readout.add_argument("--params", type=Path, default=None, help="params JSON for a .csv")
    kind = readout.add_mutually_exclusive_group()
    kind.add_argument("--simulated", dest="simulated", action="store_true", default=None)
    kind.add_argument("--real", dest="simulated", action="store_false")
    readout.add_argument("--out", type=Path, default=None, help="write the memo here")
    readout.set_defaults(handler=_readout)


def _gate(args: argparse.Namespace) -> int:
    report = run_gate(args.root, subset=None if args.full else GATE_SUBSET)
    print(report.format())
    if args.record:
        run_at = datetime.now(UTC).isoformat(timespec="seconds")
        for record in m10_records(report, pr=args.pr, git_sha=_git_sha(), run_at=run_at):
            append_run(record, args.runs_csv)
            print(f"{record.metric}={record.value:g} {record.unit} (n={record.n})")
    if report.harness_error:
        return 2
    return 0 if report.ok else 1


def _add_gate(commands) -> None:
    gate = commands.add_parser("gate", help="golden gate: every planted mutant must be blocked")
    gate.add_argument("root", nargs="?", type=Path, default=DEFAULT_GOLDEN_ROOT)
    gate.add_argument(
        "--full", action="store_true", help=f"every case, not only the {GATE_SUBSET} subset"
    )
    gate.add_argument("--record", action="store_true", help="append the M10 rows to runs.csv")
    gate.add_argument("--pr", default="")
    gate.add_argument("--runs-csv", type=Path, default=RUNS_CSV_PATH)
    gate.set_defaults(handler=_gate)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="abkit", description="TravelPlan experimentation kit")
    commands = parser.add_subparsers(dest="command", required=True)
    golden = commands.add_parser("golden", help="check abkit against a golden dataset")
    golden.add_argument("root", nargs="?", type=Path, default=DEFAULT_GOLDEN_ROOT)
    golden.add_argument(
        "--strict", action="store_true", help="also fail when a method has no implementation"
    )
    golden.add_argument(
        "--subset", default=None, help="run only a named subset of ROOT/subsets.json (ci-fast)"
    )
    golden.set_defaults(handler=_golden)
    _add_readout(commands)
    _add_gate(commands)
    add_decide(commands)
    add_actions_panel(commands)
    args = parser.parse_args(argv)
    return args.handler(args)
