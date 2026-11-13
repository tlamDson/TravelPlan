"""G-public Hillstrom (B2 plan, PR 11): published numbers, checked against their source.

The truth is Radcliffe (2008), Table 2, which reports the Hillstrom e-mail test
by arm. Each number was checked against the raw file when the case was frozen;
the treated spend per head printed there ($1.41) does not match the file
($1.4226), so it is not used.
"""

import ast
import json
from pathlib import Path

import pytest
from conftest import GOLDEN_LATEST, HILLSTROM_RAW, write_hillstrom_like

from abkit.golden.case import GoldenFormatError, load_case, load_dataset
from abkit.golden.freeze_public import (
    GENERATOR,
    PUBLIC_CASES,
    RADCLIFFE_URL,
    freeze_public,
)
from abkit.golden.methods import IMPLEMENTATIONS
from abkit.golden.runner import Status, run_golden
from abkit.hillstrom import HILLSTROM_SHA256, HILLSTROM_URL

PUBLISHED = {
    "mens-visit": {
        "n_control": 21306,
        "n_treatment": 21307,
        "mean_control": 0.1062,
        "mean_treatment": 0.1828,
        "naive_estimate": 0.0766,
        "estimate": 0.0766,
    },
    "mens-spend": {
        "n_control": 21306,
        "n_treatment": 21307,
        "mean_control": 0.65,
        "naive_estimate": 0.77,
        "estimate": 0.77,
    },
}


def _public_cases():
    return [c for c in load_dataset(GOLDEN_LATEST) if c.group == "hillstrom"]


def test_cuped_is_registered_and_every_cuped_g_ref_case_passes() -> None:
    assert "cuped" in IMPLEMENTATIONS
    report = run_golden(GOLDEN_LATEST)
    cuped_cases = [r for r in report.results if r.case_id.startswith("cuped/")]
    assert len(cuped_cases) == 3
    assert [(r.case_id, r.details) for r in cuped_cases if r.status is not Status.PASS] == []


def test_g_public_hillstrom_cases_hold_the_published_numbers() -> None:
    cases = {c.name: c for c in _public_cases()}
    assert set(cases) == set(PUBLISHED) == {c.name for c in PUBLIC_CASES}
    for name, case in cases.items():
        assert case.method == "cuped"
        assert case.expected == PUBLISHED[name]
        assert case.decision is None  # Radcliffe reports no test, so there is no decision
        assert case.source["url"] == RADCLIFFE_URL
        assert case.source["data_url"] == HILLSTROM_URL
        assert case.source["data_sha256"] == HILLSTROM_SHA256
        assert case.source["generator"] == GENERATOR
        assert case.tolerance_for("n_control").abs == 0


def test_rounding_tolerances_are_half_the_printed_unit() -> None:
    visit, spend = (load_case(GOLDEN_LATEST / "hillstrom" / n) for n in PUBLISHED)
    assert visit.tolerance_for("mean_treatment").abs == pytest.approx(0.00005)
    assert spend.tolerance_for("naive_estimate").abs == pytest.approx(0.005)
    # CUPED moves the estimate by theta times the arm imbalance in the covariate, so its
    # tolerance adds 3 sd of that shift (about 3 R SE) to the rounding.
    assert visit.tolerance_for("estimate").abs > visit.tolerance_for("naive_estimate").abs
    assert visit.tolerance_for("estimate").abs < 0.002
    assert spend.tolerance_for("estimate").abs < 0.02


def test_abkit_reproduces_the_published_hillstrom_lifts() -> None:
    report = run_golden(GOLDEN_LATEST)
    public = [r for r in report.results if r.case_id.startswith("hillstrom/")]
    assert len(public) == 2
    assert [(r.case_id, r.details) for r in public if r.status is not Status.PASS] == []


def test_cuped_is_no_longer_missing_from_the_latest_dataset() -> None:
    report = run_golden(GOLDEN_LATEST)
    missing = {r.method for r in report.results if r.status is Status.MISSING}
    # bh_fdr landed in PR 12; readout (PR 15) lands later.
    assert missing == {"readout"}
    assert report.ok(strict=False)


def test_public_freezer_never_imports_the_abkit_engine() -> None:
    allowed = {"abkit.golden.case", "abkit.hillstrom"}
    path = Path(__file__).resolve().parents[1] / "src/abkit/golden/freeze_public.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
        elif isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
    assert {m for m in imported if m.startswith("abkit")} <= allowed


def test_freezer_writes_published_truth_and_refuses_to_overwrite(tmp_path: Path) -> None:
    raw = write_hillstrom_like(tmp_path / "h.csv", n=300)
    root = tmp_path / "golden"
    written = freeze_public(raw, root, frozen_at="2026-11-13", expected_sha256=None)
    assert written == [root / "hillstrom" / c.name for c in PUBLIC_CASES]
    for case in load_dataset(root):
        assert case.expected == PUBLISHED[case.name]  # the file never sets the truth
        assert case.source["frozen_at"] == "2026-11-13"
        assert case.read_data()["variant"].size == 200
    with pytest.raises(GoldenFormatError, match="already exists"):
        freeze_public(raw, root, frozen_at="2026-11-13", expected_sha256=None)
    assert freeze_public(raw, root, frozen_at="2026-11-14", force=True, expected_sha256=None)


def test_freezer_checks_the_raw_file(tmp_path: Path) -> None:
    raw = write_hillstrom_like(tmp_path / "h.csv", n=30)
    with pytest.raises(ValueError, match="sha256"):
        freeze_public(raw, tmp_path / "golden")


@pytest.mark.skipif(not HILLSTROM_RAW.is_file(), reason="raw Hillstrom CSV not on this machine")
def test_committed_public_cases_are_what_the_freezer_makes(tmp_path: Path) -> None:
    frozen_at = json.loads((GOLDEN_LATEST / "hillstrom/mens-visit/truth.json").read_text())
    frozen_at = frozen_at["source"]["frozen_at"]
    freeze_public(HILLSTROM_RAW, tmp_path, frozen_at=frozen_at)
    for case in PUBLIC_CASES:
        for name in ("data.csv", "truth.json"):
            committed = (GOLDEN_LATEST / "hillstrom" / case.name / name).read_bytes()
            fresh = (tmp_path / "hillstrom" / case.name / name).read_bytes()
            assert committed.replace(b"\r\n", b"\n") == fresh, f"{case.name}/{name}"
