"""``abkit`` command line (also ``python -m abkit``).

    abkit golden [ROOT] [--strict] [--subset NAME]
    abkit readout PATH [--params JSON] [--simulated | --real] [--out FILE]
    abkit decide export|label|kappa  (G-decide, see abkit/labeling)

``golden`` exit codes: 0 every case passes (MISSING allowed unless ``--strict``),
1 a case fails, errors, or is MISSING under ``--strict``, 2 malformed dataset.
``readout`` prints the one-page memo of a readout case directory or a CSV (exit 0,
also when SRM blocks the conclusion) and exits 2 on bad input.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from abkit.golden.case import GoldenFormatError
from abkit.golden.runner import run_golden
from abkit.labeling.cli import add_decide
from abkit.readout.inputs import load_readout_input

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
    add_decide(commands)
    args = parser.parse_args(argv)
    return args.handler(args)
