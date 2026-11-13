"""Freeze the G-public Hillstrom cases: published numbers, never computed by abkit.

    python -m abkit.golden.freeze_public D:/data/b2/hillstrom.csv [ROOT] [--force]

The truth is Radcliffe (2008), "Hillstrom's MineThatData Email Analytics
Challenge: An Approach Using Uplift Modelling", Table 2 (``RADCLIFFE_URL``):
visit rate and spend per head for the Mens e-mail against no e-mail, and
Table 1 for the arm sizes. Each number here was checked against the raw file
before it was used. The treated spend per head printed there ($1.41) is not
what the file holds ($1.4226), so it is left out.

The data is the two arms of the raw file (``variant``, ``value``,
``covariate``), cell text unchanged. Tolerances: counts are exact; a printed
number passes within half its last printed unit; the CUPED ``estimate`` also
gets 3 sd of the shift CUPED makes (``theta`` times the arm imbalance in the
covariate, sd about ``R * SE``), computed here with NumPy.

This module may import only the golden format and the Hillstrom loader
(``test_golden_public.py`` enforces it).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from abkit.golden.case import GoldenFormatError, load_case
from abkit.hillstrom import HILLSTROM_SHA256, HILLSTROM_URL, load_hillstrom, two_arms

GENERATOR = "abkit.golden.freeze_public"
DEFAULT_ROOT = Path(__file__).resolve().parents[4] / "golden/v2"
GROUP = "hillstrom"
RADCLIFFE_URL = "http://minethatdata.com/Stochastic_Solutions_E-Mail_Challenge_2008.04.30.pdf"
_N = {"n_control": 21306, "n_treatment": 21307}


@dataclass(frozen=True)
class PublicCase:
    name: str
    outcome: str
    covariate: str
    description: str
    #: Output key -> the number as printed in the source.
    published: dict[str, float | int]
    #: Half the last printed unit of each rounded number.
    half_unit: float
    where: str


PUBLIC_CASES: tuple[PublicCase, ...] = (
    PublicCase(
        name="mens-visit",
        outcome="visit",
        covariate="recency",
        description=(
            "Hillstrom e-mail test, Mens E-Mail vs No E-Mail: two-week visit rate, "
            "CUPED-adjusted by recency (months since last purchase)."
        ),
        published={
            **_N,
            "mean_control": 0.1062,
            "mean_treatment": 0.1828,
            "naive_estimate": 0.0766,
            "estimate": 0.0766,
        },
        half_unit=0.00005,
        where="Table 2, Men's row, Visit Rate: treated 18.28%, control 10.62%, uplift 7.66%",
    ),
    PublicCase(
        name="mens-spend",
        outcome="spend",
        covariate="history",
        description=(
            "Hillstrom e-mail test, Mens E-Mail vs No E-Mail: two-week spend per head "
            "in dollars, CUPED-adjusted by history (spend in the past year)."
        ),
        published={**_N, "mean_control": 0.65, "naive_estimate": 0.77, "estimate": 0.77},
        half_unit=0.005,
        where=(
            "Table 2, Men's row, Spend / head: control $0.65, uplift $0.77 "
            "(treated $1.41 is not used: the file gives $1.4226)"
        ),
    ),
)


def _render_csv(arms: dict, case: PublicCase) -> str:
    rows = zip(arms["variant"], arms[case.outcome], arms[case.covariate], strict=True)
    return "\n".join(["variant,value,covariate", *(",".join(r) for r in rows)]) + "\n"


def _cuped_shift_sd(arms: dict, case: PublicCase) -> float:
    """About R * SE: sd of theta (mean x_t - mean x_c) under randomization."""
    y, x = arms[case.outcome].astype(float), arms[case.covariate].astype(float)
    is_t = arms["variant"] == "treatment"
    r = float(np.corrcoef(y, x)[0, 1])
    se = math.sqrt(y[is_t].var(ddof=1) / is_t.sum() + y[~is_t].var(ddof=1) / (~is_t).sum())
    return abs(r) * se


def _tolerance(arms: dict, case: PublicCase) -> dict:
    tolerance = {"default": {"abs": 0, "rel": 0}}
    for key in case.published:
        if key in _N:
            continue
        slack = case.half_unit
        if key == "estimate":
            slack += 3 * _cuped_shift_sd(arms, case)
        tolerance[key] = {"abs": slack, "rel": 0}
    return tolerance


def _write_case(arms: dict, case: PublicCase, case_dir: Path, sha256: str, frozen_at: str) -> None:
    case_dir.mkdir(parents=True)
    (case_dir / "data.csv").write_text(_render_csv(arms, case), "utf-8", newline="\n")
    truth = {
        "schema_version": 1,
        "id": f"{GROUP}/{case.name}",
        "method": "cuped",
        "description": case.description,
        "data": "data.csv",
        "params": {"alpha": 0.05, "alternative": "two-sided"},
        "expected": case.published,
        "decision": None,
        "tolerance": _tolerance(arms, case),
        "source": {
            "tool": "published",
            "version": "Radcliffe (2008), Stochastic Solutions, Tables 1-2",
            "call": (
                f"{case.where}; arm sizes from Table 1. Published numbers are unadjusted "
                "group means; CUPED keeps the same estimand."
            ),
            "url": RADCLIFFE_URL,
            "data_url": HILLSTROM_URL,
            "data_sha256": sha256,
            "generator": GENERATOR,
            "frozen_at": frozen_at,
        },
    }
    text = json.dumps(truth, indent=2) + "\n"
    (case_dir / "truth.json").write_text(text, "utf-8", newline="\n")
    load_case(case_dir)


def freeze_public(
    raw_path: Path,
    root: Path = DEFAULT_ROOT,
    frozen_at: str | None = None,
    force: bool = False,
    expected_sha256: str | None = HILLSTROM_SHA256,
) -> list[Path]:
    """Write each case of ``PUBLIC_CASES`` under ``root/hillstrom/``; returns the directories."""
    columns = load_hillstrom(raw_path, expected_sha256)
    sha256 = hashlib.sha256(Path(raw_path).read_bytes()).hexdigest()
    arms = two_arms(columns, treatment="Mens E-Mail", control="No E-Mail")
    frozen_at = frozen_at or datetime.now(UTC).date().isoformat()
    targets = [Path(root) / GROUP / c.name for c in PUBLIC_CASES]
    existing = [t for t in targets if t.exists()]
    if existing and not force:
        raise GoldenFormatError(
            f"{existing[0]} already exists; a changed case goes in a new dataset version"
        )
    for case, case_dir in zip(PUBLIC_CASES, targets, strict=True):
        if case_dir.exists():
            shutil.rmtree(case_dir)
        _write_case(arms, case, case_dir, sha256, frozen_at)
    return targets


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="abkit.golden.freeze_public")
    parser.add_argument("raw", type=Path, help="raw Hillstrom CSV")
    parser.add_argument("root", nargs="?", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--force", action="store_true", help="overwrite existing cases")
    parser.add_argument("--frozen-at", default=None, help="date recorded in source.frozen_at")
    args = parser.parse_args(argv)
    written = freeze_public(args.raw, args.root, frozen_at=args.frozen_at, force=args.force)
    print(f"froze {len(written)} G-public cases under {args.root / GROUP}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
