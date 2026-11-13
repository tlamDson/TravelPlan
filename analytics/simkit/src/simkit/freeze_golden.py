"""Freeze the G-sim cases into ``analytics/golden/v2/sim-*`` (SIMULATED virtual users).

    python -m simkit.freeze_golden [ROOT] [--only ID ...] [--force] [--frozen-at YYYY-MM-DD]

For each case of ``simkit.golden_cases`` it tries seeds ``first_seed, first_seed + 1, ...``
until ``simkit.golden_reference.screen`` accepts the draw, then writes ``data.csv`` (observed
arm only) and ``truth.json`` (true effect from both potential outcomes, the planted decision,
and how many seeds were tried). An existing case is never overwritten without ``--force``: a
changed case belongs in a new dataset version.
"""

from __future__ import annotations

import argparse
import json
import shutil
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path
from typing import Any

import numpy as np
import scipy
from abkit.golden.case import GoldenFormatError, load_case
from abkit.golden.freeze_ref import render_csv

from simkit.golden_cases import SIM_CASES, START, SimCase
from simkit.golden_reference import early_test, naive_peek, screen, verdict
from simkit.golden_truth import TOLERANCE_SE, data_columns, observe, truth

GENERATOR = "simkit.freeze_golden"
DEFAULT_ROOT = Path(__file__).resolve().parents[3] / "golden/v2"
DEFAULT_MAX_ATTEMPTS = 200
CALL = (
    "simkit.golden_truth.observe: the same simulated users run in both arms; "
    "estimate = mean over enrolled users of Y(treatment) - Y(control) "
    "(ratio: sum Y_num / sum Y_den per arm); tolerance = "
    f"{TOLERANCE_SE:g} x the standard error of the observed difference"
)


@dataclass(frozen=True)
class Built:
    csv: str
    truth: dict[str, Any]  # truth.json without source.frozen_at
    problems: list[str]


def _arrays(columns: dict[str, list[Any]]) -> dict[str, np.ndarray]:
    """What ``read_csv_columns`` returns for ``render_csv(columns)``."""
    arrays = {}
    for name, values in columns.items():
        if all(isinstance(v, int | float) for v in values):
            arrays[name] = np.array(values, dtype=np.float64)
        else:
            arrays[name] = np.array(values, dtype=str)
    return arrays


def _sig(x: float) -> float:
    return float(f"{x:.4g}")


def _screening(case: SimCase, seed: int, data: dict[str, np.ndarray]) -> dict[str, Any]:
    v = verdict(case, data)
    info: dict[str, Any] = {
        "first_seed": case.first_seed,
        "attempts": seed - case.first_seed + 1,
        "reference": f"scipy {scipy.__version__}: chi-square SRM, then Welch or delta-method z",
        "verdict": v.outcome,
        "srm_p_value": _sig(v.srm_p),
    }
    if v.p_value is not None:
        info["p_value"] = _sig(v.p_value)
    if case.metric == "late":
        estimate, p_value = early_test(case, data)
        info["early"] = {"estimate": _sig(estimate), "p_value": _sig(p_value)}
    if case.peeking:
        peek = naive_peek(case, data)
        if peek is not None:
            info["naive_peek"] = {
                "day": peek.day,
                "estimate": _sig(peek.estimate),
                "p_value": _sig(peek.p_value),
            }
    return info


def build_case(case: SimCase, seed: int) -> Built:
    """Data and truth of ``case`` drawn with ``seed``, and why screening rejects it (if so)."""
    users = observe(case, seed)
    columns = data_columns(case, users)
    data = _arrays(columns)
    expected, tolerance = truth(case, users)
    problems = screen(case, data, expected, tolerance)
    source = {
        "tool": "simkit",
        "version": version("simkit"),
        "call": CALL,
        "generator": GENERATOR,
        "seed": seed,
        "simulated": True,
        "injected": {
            "experiment": case.experiment().to_dict(),
            "users": case.users,
            "days": case.days,
            "window_days": case.window_days,
            "start": START.isoformat(),
            "enrolled": len(users),
        },
        "screening": _screening(case, seed, data),
    }
    truth_json = {
        "schema_version": 1,
        "id": case.id,
        "method": "readout",
        "description": case.description,
        "data": "data.csv",
        "params": case.params(),
        "expected": expected,
        "decision": case.decision,
        "tolerance": tolerance,
        "source": source,
    }
    return Built(render_csv(columns), truth_json, problems)


def search(case: SimCase, max_attempts: int = DEFAULT_MAX_ATTEMPTS) -> Built:
    """The first draw from ``first_seed`` on that screening accepts."""
    last: list[str] = []
    for seed in range(case.first_seed, case.first_seed + max_attempts):
        built = build_case(case, seed)
        if not built.problems:
            return built
        last = built.problems
    raise ValueError(f"{case.id}: no seed in {max_attempts} attempts passes screening ({last})")


def _write(built: Built, case_dir: Path, frozen_at: str) -> None:
    case_dir.mkdir(parents=True)
    (case_dir / "data.csv").write_text(built.csv, "utf-8", newline="\n")
    truth_json = {**built.truth, "source": {**built.truth["source"], "frozen_at": frozen_at}}
    text = json.dumps(truth_json, indent=2) + "\n"
    (case_dir / "truth.json").write_text(text, "utf-8", newline="\n")
    load_case(case_dir)


def freeze(
    root: Path,
    cases: Iterable[SimCase] = SIM_CASES,
    frozen_at: str | None = None,
    force: bool = False,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
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
    for case, case_dir in zip(cases, targets, strict=True):
        built = search(case, max_attempts)
        if case_dir.exists():
            shutil.rmtree(case_dir)
        _write(built, case_dir, frozen_at)
    return targets


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="simkit.freeze_golden")
    parser.add_argument("root", nargs="?", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--only", nargs="+", default=None, help="case ids to freeze")
    parser.add_argument("--force", action="store_true", help="overwrite existing cases")
    parser.add_argument("--frozen-at", default=None, help="date recorded in source.frozen_at")
    args = parser.parse_args(argv)
    cases = [c for c in SIM_CASES if args.only is None or c.id in args.only]
    for case in cases:
        [case_dir] = freeze(args.root, [case], frozen_at=args.frozen_at, force=args.force)
        print(f"froze {case.id} -> {case_dir}", flush=True)
    print(f"froze {len(cases)} G-sim cases (simulated) under {args.root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
