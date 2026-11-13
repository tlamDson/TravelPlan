"""``abkit`` command line (also ``python -m abkit``).

    abkit golden [ROOT] [--strict]

Exit codes: 0 every case passes (MISSING allowed unless ``--strict``),
1 a case fails, errors, or is MISSING under ``--strict``, 2 malformed dataset.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from abkit.golden.case import GoldenFormatError
from abkit.golden.runner import run_golden

DEFAULT_GOLDEN_ROOT = Path(__file__).resolve().parents[3] / "golden/v2"


def _golden(args: argparse.Namespace) -> int:
    try:
        report = run_golden(args.root)
    except GoldenFormatError as err:
        print(f"abkit golden: {err}", file=sys.stderr)
        return 2
    print(report.format())
    return 0 if report.ok(strict=args.strict) else 1


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="abkit", description="TravelPlan experimentation kit")
    commands = parser.add_subparsers(dest="command", required=True)
    golden = commands.add_parser("golden", help="check abkit against a golden dataset")
    golden.add_argument("root", nargs="?", type=Path, default=DEFAULT_GOLDEN_ROOT)
    golden.add_argument(
        "--strict", action="store_true", help="also fail when a method has no implementation"
    )
    golden.set_defaults(handler=_golden)
    args = parser.parse_args(argv)
    return args.handler(args)
