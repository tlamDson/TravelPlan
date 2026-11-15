"""Freeze the G-public Criteo case: the published v2.1 key figures, never computed by abkit.

    python -m abkit.golden.freeze_criteo [RAW] [--root ROOT] [--force] [--frozen-at YYYY-MM-DD]

The truth is the "Key figures" printed for the un-biased file on the Criteo AI Lab page.
Table 1 of Diemert et al. (2021) prints the same rows and treatment ratio, and 4.70% /
0.29% for visit / conversion. Its "Relative Avg. Uplift" (68.7% / 37.2%) does not match
the file, which gives 27.1% / 59.4% as (treated - control) / control, so it is not used.
The data is the arm totals of the raw file: the license (CC BY-NC-SA 4.0) and the B2 plan
keep the rows out of git. This module may import only the golden format and the Criteo
loader (``test_golden_public_criteo.py`` enforces it).
"""

from __future__ import annotations

import argparse
import json
import shutil
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from abkit.criteo import (
    CRITEO_MIRROR_URL,
    CRITEO_PAGE_URL,
    CRITEO_PAPER_URL,
    CRITEO_SHA256,
    CRITEO_URL,
    DEFAULT_RAW,
    arm_counts,
    file_sha256,
)
from abkit.golden.case import GoldenFormatError, load_case

GENERATOR = "abkit.golden.freeze_criteo"
GROUP = "criteo"
CASE_NAME = "v21-key-figures"
DEFAULT_ROOT = Path(__file__).resolve().parents[4] / "golden/v2"

#: Criteo AI Lab page, "Key figures" of the un-biased file (checked against the raw file).
PUBLISHED = {
    "n_total": 13979592,
    "visit_rate": 0.046992,
    "conversion_rate": 0.00292,
    "treatment_ratio": 0.85,
}
#: Half a unit of the last printed digit; the row count is exact.
TOLERANCE = {
    "default": {"abs": 0.0, "rel": 0.0},
    "visit_rate": {"abs": 5e-7, "rel": 0.0},
    "conversion_rate": {"abs": 5e-6, "rel": 0.0},
    "treatment_ratio": {"abs": 0.005, "rel": 0.0},
}
COLUMNS = ("variant", "n", "visit", "conversion", "exposure")


def render_counts(counts: dict[str, dict[str, int]]) -> str:
    lines = [",".join(COLUMNS)]
    for variant in ("control", "treatment"):
        lines.append(",".join([variant, *(str(counts[variant][c]) for c in COLUMNS[1:])]))
    return "\n".join(lines) + "\n"


def _truth(frozen_at: str, sha256: str) -> dict:
    return {
        "schema_version": 1,
        "id": f"{GROUP}/{CASE_NAME}",
        "method": "uplift_arm_summary",
        "description": (
            "Criteo Uplift v2.1 (un-biased): rows, treatment share and pooled visit and "
            "conversion rates from the arm totals of the full file."
        ),
        "data": "data.csv",
        "params": {},
        "expected": PUBLISHED,
        "decision": None,
        "tolerance": TOLERANCE,
        "source": {
            "tool": "published",
            "version": "Criteo AI Lab page, key figures of the un-biased file (v2.1)",
            "call": (
                "n_total = n_c + n_t; treatment_ratio = n_t / n_total; "
                "visit_rate and conversion_rate pooled over both arms"
            ),
            "url": CRITEO_PAGE_URL,
            "paper_url": CRITEO_PAPER_URL,
            "paper_table": (
                "Diemert et al. (2021), Table 1, CRITEO-UPLIFTv2: size 13,979,592; "
                "treatment ratio .85; avg. positive outcome visit / conversion 4.70 / 0.29 %"
            ),
            "not_used": (
                "Table 1 Relative Avg. Uplift (visit / conversion) 68.7 / 37.2 %: the file "
                "gives 27.1 / 59.4 % as (treated - control) / control"
            ),
            "license": "CC BY-NC-SA 4.0 (Criteo page); data.csv holds only the arm totals",
            "data_url": CRITEO_URL,
            "data_mirror_url": CRITEO_MIRROR_URL,
            "data_sha256": sha256,
            "generator": GENERATOR,
            "frozen_at": frozen_at,
        },
    }


def freeze_criteo(
    raw: Path,
    root: Path = DEFAULT_ROOT,
    frozen_at: str | None = None,
    force: bool = False,
    expected_sha256: str | None = CRITEO_SHA256,
) -> Path:
    """Write ``root/criteo/v21-key-figures/`` from the raw file; returns the case directory."""
    case_dir = Path(root) / GROUP / CASE_NAME
    if case_dir.exists() and not force:
        raise GoldenFormatError(
            f"{case_dir} already exists; a changed case goes in a new dataset version"
        )
    counts = arm_counts(raw, expected_sha256=expected_sha256)
    if case_dir.exists():
        shutil.rmtree(case_dir)
    case_dir.mkdir(parents=True)
    (case_dir / "data.csv").write_text(render_counts(counts), "utf-8", newline="\n")
    sha256 = expected_sha256 if expected_sha256 is not None else file_sha256(raw)
    truth = _truth(frozen_at or datetime.now(UTC).date().isoformat(), sha256)
    text = json.dumps(truth, indent=2) + "\n"
    (case_dir / "truth.json").write_text(text, "utf-8", newline="\n")
    load_case(case_dir)
    return case_dir


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="abkit.golden.freeze_criteo")
    parser.add_argument("raw", nargs="?", type=Path, default=DEFAULT_RAW)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--force", action="store_true", help="overwrite the existing case")
    parser.add_argument("--frozen-at", default=None, help="date recorded in source.frozen_at")
    args = parser.parse_args(argv)
    case_dir = freeze_criteo(args.raw, args.root, frozen_at=args.frozen_at, force=args.force)
    print(f"froze {case_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
