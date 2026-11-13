"""Freeze the G-ref cases: truth computed by scipy / statsmodels, never by abkit.

    python -m abkit.golden.freeze_ref [ROOT] [--force] [--frozen-at YYYY-MM-DD]

Needs the ``[golden]`` extra (statsmodels) for the power and BH cases; the
numbers come from ``abkit.golden.ref_truth``. This module may import only the
golden format, the case table and ``ref_truth`` (``test_golden_reference.py``
enforces it). An existing case is never overwritten without ``--force``: a changed case
belongs in a new dataset version.
"""

from __future__ import annotations

import argparse
import json
import shutil
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from pathlib import Path

from abkit.golden.case import GoldenFormatError, load_case, read_csv_columns
from abkit.golden.ref_cases import REF_CASES, Columns, RefCase
from abkit.golden.ref_truth import compute_reference

GENERATOR = "abkit.golden.freeze_ref"
DEFAULT_ROOT = Path(__file__).resolve().parents[4] / "golden/v1"


def render_csv(columns: Columns) -> str:
    """CSV text of equal-length columns; floats use ``repr`` so they round-trip."""
    names = list(columns)
    rows = zip(*(columns[n] for n in names), strict=True)
    cells = (",".join(repr(v) if isinstance(v, float) else str(v) for v in row) for row in rows)
    return "\n".join([",".join(names), *cells]) + "\n"


def _write_case(ref: RefCase, case_dir: Path, frozen_at: str) -> None:
    case_dir.mkdir(parents=True)
    data = None
    if ref.make_data is not None:
        (case_dir / "data.csv").write_text(render_csv(ref.make_data()), "utf-8", newline="\n")
        data = read_csv_columns(case_dir / "data.csv")
    result = compute_reference(ref.method, data, ref.params)
    source = {**result.source, "generator": GENERATOR, "frozen_at": frozen_at}
    if ref.seed is not None:
        source["seed"] = ref.seed
    truth = {
        "schema_version": 1,
        "id": f"{ref.group}/{ref.name}",
        "method": ref.method,
        "description": ref.description,
        "data": None if data is None else "data.csv",
        "params": ref.params,
        "expected": result.expected,
        "decision": result.decision,
        "tolerance": ref.tolerance,
        "source": source,
    }
    text = json.dumps(truth, indent=2) + "\n"
    (case_dir / "truth.json").write_text(text, "utf-8", newline="\n")
    load_case(case_dir)


def freeze(
    root: Path,
    cases: Iterable[RefCase] = REF_CASES,
    frozen_at: str | None = None,
    force: bool = False,
) -> list[Path]:
    """Write each case under ``root/<group>/<name>/``; returns the case directories."""
    root, cases = Path(root), list(cases)
    frozen_at = frozen_at or datetime.now(UTC).date().isoformat()
    targets = [root / c.group / c.name for c in cases]
    existing = [t for t in targets if t.exists()]
    if existing and not force:
        raise GoldenFormatError(
            f"{existing[0]} already exists; a changed case goes in a new dataset version"
        )
    for ref, case_dir in zip(cases, targets, strict=True):
        if case_dir.exists():
            shutil.rmtree(case_dir)
        _write_case(ref, case_dir, frozen_at)
    return targets


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="abkit.golden.freeze_ref")
    parser.add_argument("root", nargs="?", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--force", action="store_true", help="overwrite existing cases")
    parser.add_argument("--frozen-at", default=None, help="date recorded in source.frozen_at")
    args = parser.parse_args(argv)
    written = freeze(args.root, frozen_at=args.frozen_at, force=args.force)
    print(f"froze {len(written)} G-ref cases under {args.root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
