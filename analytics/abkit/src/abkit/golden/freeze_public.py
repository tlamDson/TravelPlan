"""Freeze the G-public LaLonde NSW cases from Dehejia & Wahba's raw files (B2 plan, PR 17).

    python -m abkit.golden.freeze_public D:/data/b2/lalonde [ROOT] [--force]

The truth is the published numbers of Dehejia & Wahba (1999), NBER WP 6586, Tables 2-3:
the NSW experimental estimate $1,794 (SE 633) and the PSID-1 difference in means -$15,205
(SE 1,154 in Table 3, 1,155 in Table 2). Nothing here runs the abkit engine: this file only
reshapes the raw text files into ``data.csv`` and writes the published numbers.

The observational cases (IPW, AIPW on NSW treated + PSID-1 controls) expect the experimental
estimate, with the experimental 95% CI half-width (1.96 x 633) as the tolerance: an estimate
inside that interval recovers the benchmark. DW's logit for PSID-1 (Table 3, note c) is the
propensity model; their regression covariates (note a) are the AIPW outcome model.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from abkit.golden.case import SCHEMA_VERSION, TRUTH_FILE

DEFAULT_ROOT = Path(__file__).resolve().parents[4] / "golden/v2"
PAPER_URL = "https://www.nber.org/papers/w6586"
DATA_URL = "https://users.nber.org/~rdehejia/data/.nswdata2.html"
#: Raw files as served on 2026-11-13 from https://users.nber.org/~rdehejia/data/<name>.
RAW_FILES = {
    "nswre74_treated.txt": "e7b742fe0ff07a0f45e129b4ff108bb9611cd83d53604732c48a8a0a3e20eda3",
    "nswre74_control.txt": "a1364cea459d953dc691a667d99194b4ad335d6d550354fe23a5d2dc58d729b5",
    "psid_controls.txt": "73ffcdd8feb7f965f8e1de9bfdb80a095542c7a95ce7f56b2e2b2a9716e858cc",
}
RAW_COLUMNS = ("treatment", "age", "educ", "black", "hisp", "married", "nodegree")
RAW_COLUMNS += ("re74", "re75", "re78")
#: DW Table 1 legend: Ux = 1 if unemployed (zero earnings) in 19x.
COLUMNS = (*RAW_COLUMNS, "u74", "u75")
EXPERIMENTAL = 1794
EXPERIMENTAL_SE = 633
PSID_NAIVE = -15205
#: Two-sided 95% normal quantile times the published experimental SE.
CI_HALF_WIDTH = round(1.959963984540054 * EXPERIMENTAL_SE, 2)
#: DW Table 3, note c: the PSID-1 logit.
PSID_PROPENSITY = [
    "age", "age^2", "educ", "educ^2", "married", "nodegree", "black", "hisp",
    "re74", "re75", "re74^2", "re75^2", "u74*black",
]  # fmt: skip
#: DW Table 3, note a: the regression covariates (without the treatment indicator).
DW_REGRESSION = ["age", "age^2", "educ", "nodegree", "black", "hisp", "re74", "re75"]


@dataclass(frozen=True)
class BuiltCase:
    case_id: str
    truth: dict
    csv_text: str


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _read_raw(path: Path) -> list[list[float]]:
    rows = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        cells = [float(c) for c in line.split()]
        if len(cells) != len(RAW_COLUMNS):
            raise ValueError(f"{path}:{number}: {len(cells)} values, expected {len(RAW_COLUMNS)}")
        rows.append(cells)
    return rows


def _render(rows: list[list[float]]) -> str:
    lines = [",".join(COLUMNS)]
    for row in rows:
        values = [*row, float(row[7] == 0), float(row[8] == 0)]
        lines.append(",".join(format(v, ".10g") for v in values))
    return "\n".join(lines) + "\n"


def _source(call: str, files: Sequence[str], frozen_at: str) -> dict:
    return {
        "tool": "published",
        "version": "Dehejia & Wahba (1999), NBER WP 6586; JASA 94(448):1053-1062",
        "call": call,
        "paper_url": PAPER_URL,
        "data_url": DATA_URL,
        "data_files": {name: RAW_FILES[name] for name in files},
        "generator": "abkit.golden.freeze_public",
        "frozen_at": frozen_at,
    }


def _truth(case_id, method, description, params, expected, tolerance, source) -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "id": case_id,
        "method": method,
        "description": description,
        "data": "data.csv",
        "params": params,
        "expected": expected,
        "decision": None,
        "tolerance": tolerance,
        "source": source,
    }


def build_lalonde_cases(
    raw_dir: Path, check_hashes: bool = True, frozen_at: str | None = None
) -> list[BuiltCase]:
    raw_dir = Path(raw_dir)
    if check_hashes:
        for name, digest in RAW_FILES.items():
            if _sha256(raw_dir / name) != digest:
                raise ValueError(f"{raw_dir / name}: sha256 differs from the pinned download")
    frozen_at = frozen_at or date.today().isoformat()
    treated = _read_raw(raw_dir / "nswre74_treated.txt")
    experimental = _render(treated + _read_raw(raw_dir / "nswre74_control.txt"))
    psid = _render(treated + _read_raw(raw_dir / "psid_controls.txt"))
    exp_files = ("nswre74_treated.txt", "nswre74_control.txt")
    psid_files = ("nswre74_treated.txt", "psid_controls.txt")
    benchmark_tol = {"default": {"abs": CI_HALF_WIDTH, "rel": 0}}
    observational = "NSW treated (185) + PSID-1 controls (2,490): the ATT must land inside the"
    observational += f" experimental 95% CI, {EXPERIMENTAL} +/- 1.96 x {EXPERIMENTAL_SE}"
    cases = [
        BuiltCase(
            "public/lalonde-experimental",
            _truth(
                "public/lalonde-experimental",
                "naive_diff",
                "NSW RE74 subsample (185 treated, 260 randomized controls): the experimental "
                "benchmark, difference in 1978 earnings with the OLS standard error.",
                {"outcome": "re78", "se_type": "pooled", "alpha": 0.05},
                {"estimate": EXPERIMENTAL, "se": EXPERIMENTAL_SE},
                {"default": {"abs": 0.5, "rel": 0}},
                _source("Table 2 panel B col (1); Table 3 col (1); row NSW", exp_files,
                        frozen_at),
            ),
            experimental,
        ),
        BuiltCase(
            "public/lalonde-psid-naive",
            _truth(
                "public/lalonde-psid-naive",
                "naive_diff",
                "NSW treated + PSID-1 controls: the unadjusted difference, far from the "
                "experimental benchmark.",
                {"outcome": "re78", "se_type": "pooled", "alpha": 0.05},
                {"estimate": PSID_NAIVE, "se": 1154.5},
                {"default": {"abs": 0.5, "rel": 0}, "se": {"abs": 1.0, "rel": 0}},
                _source("Table 3 col (1) row PSID-1 (SE 1154; Table 2 prints 1155)", psid_files,
                        frozen_at),
            ),
            psid,
        ),
        BuiltCase(
            "public/lalonde-psid-ipw",
            _truth(
                "public/lalonde-psid-ipw",
                "ipw",
                f"{observational}. Normalized IPW-ATT, DW's PSID-1 logit.",
                {"outcome": "re78", "estimand": "att", "propensity_terms": PSID_PROPENSITY,
                 "alpha": 0.05},
                {"estimate": EXPERIMENTAL},
                benchmark_tol,
                _source("benchmark: Table 3 col (1) row NSW; logit: Table 3 note c", psid_files,
                        frozen_at),
            ),
            psid,
        ),
        BuiltCase(
            "public/lalonde-psid-aipw",
            _truth(
                "public/lalonde-psid-aipw",
                "aipw",
                f"{observational}. AIPW-ATT, DW's PSID-1 logit and DW's regression covariates "
                "for the control outcome model.",
                {"outcome": "re78", "estimand": "att", "propensity_terms": PSID_PROPENSITY,
                 "outcome_terms": DW_REGRESSION, "alpha": 0.05},
                {"estimate": EXPERIMENTAL},
                benchmark_tol,
                _source("benchmark: Table 3 col (1) row NSW; logit: Table 3 note c; outcome "
                        "covariates: Table 3 note a", psid_files, frozen_at),
            ),
            psid,
        ),
    ]  # fmt: skip
    return cases


def freeze_lalonde(
    root: Path, raw_dir: Path, check_hashes: bool = True, force: bool = False
) -> list[Path]:
    """Write every LaLonde case under ``root``; an existing case is kept unless ``force``."""
    written = []
    for case in build_lalonde_cases(raw_dir, check_hashes):
        case_dir = Path(root) / case.case_id
        if case_dir.exists():
            if not force:
                raise FileExistsError(f"{case_dir} already exists; pass force to rewrite it")
            shutil.rmtree(case_dir)
        case_dir.mkdir(parents=True)
        (case_dir / "data.csv").write_text(case.csv_text, encoding="utf-8", newline="\n")
        truth = json.dumps(case.truth, indent=2) + "\n"
        (case_dir / TRUTH_FILE).write_text(truth, encoding="utf-8", newline="\n")
        written.append(case_dir)
    return written


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m abkit.golden.freeze_public")
    parser.add_argument("raw_dir", type=Path, help="folder with the three DW .txt files")
    parser.add_argument("root", type=Path, nargs="?", default=DEFAULT_ROOT)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)
    for path in freeze_lalonde(args.root, args.raw_dir, force=args.force):
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
