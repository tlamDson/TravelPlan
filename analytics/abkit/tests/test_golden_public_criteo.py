"""G-public Criteo (B2 plan, PR 20): the published v2.1 key figures, checked against the file.

The truth is the "Key figures" of the un-biased file on the Criteo AI Lab page
(rows, average visit rate, average conversion rate, treatment ratio); Table 1 of
Diemert et al. (2021) prints the same rows and ratio, and 4.70% / 0.29%. Each was
checked against the raw file when the case was frozen. Table 1's "Relative Avg.
Uplift" (68.7% visit, 37.2% conversion) does not match the file (27.1% / 59.4%
as (treated - control) / control), so it is not used.
"""

import ast
import json
from pathlib import Path

import pytest
from conftest import GOLDEN_LATEST
from criteo_fixtures import CRITEO_RAW, write_criteo_like

from abkit.criteo import CRITEO_PAGE_URL, CRITEO_PAPER_URL, CRITEO_SHA256, CRITEO_URL
from abkit.golden.case import GoldenFormatError, load_case, load_dataset
from abkit.golden.freeze_criteo import CASE_NAME, GENERATOR, PUBLISHED, freeze_criteo
from abkit.golden.methods import IMPLEMENTATIONS, KNOWN_METHODS
from abkit.golden.runner import Status, run_golden

CASE_DIR = GOLDEN_LATEST / "criteo" / "v21-key-figures"


def test_published_figures_are_the_criteo_page_numbers() -> None:
    assert CASE_NAME == "v21-key-figures"
    assert PUBLISHED == {
        "n_total": 13979592,
        "visit_rate": 0.046992,
        "conversion_rate": 0.00292,
        "treatment_ratio": 0.85,
    }


def test_uplift_arm_summary_is_a_known_and_registered_method() -> None:
    assert "uplift_arm_summary" in KNOWN_METHODS
    assert "uplift_arm_summary" in IMPLEMENTATIONS


def test_committed_case_holds_the_published_numbers_and_their_sources() -> None:
    case = load_case(CASE_DIR)
    assert case.method == "uplift_arm_summary"
    assert case.expected == PUBLISHED
    assert case.decision is None
    assert case.source["url"] == CRITEO_PAGE_URL
    assert case.source["paper_url"] == CRITEO_PAPER_URL
    assert case.source["data_url"] == CRITEO_URL
    assert case.source["data_sha256"] == CRITEO_SHA256
    assert case.source["generator"] == GENERATOR
    # Half a unit of the last printed digit.
    assert case.tolerance_for("n_total").abs == 0
    assert case.tolerance_for("visit_rate").abs == pytest.approx(5e-7)
    assert case.tolerance_for("conversion_rate").abs == pytest.approx(5e-6)
    assert case.tolerance_for("treatment_ratio").abs == pytest.approx(0.005)


def test_committed_data_is_two_rows_of_counts_not_raw_rows() -> None:
    """CC BY-NC-SA: the plan does not republish the file, so the case keeps only arm totals."""
    data = load_case(CASE_DIR).read_data()
    assert set(data) == {"variant", "n", "visit", "conversion", "exposure"}
    assert data["variant"].tolist() == ["control", "treatment"]


def test_abkit_reproduces_the_published_criteo_figures() -> None:
    report = run_golden(GOLDEN_LATEST)
    public = [r for r in report.results if r.case_id.startswith("criteo/")]
    assert [(r.case_id, r.status, r.details) for r in public] == [
        ("criteo/v21-key-figures", Status.PASS, ())
    ]


def test_criteo_freezer_never_imports_the_abkit_engine() -> None:
    allowed = {"abkit.golden.case", "abkit.criteo"}
    path = Path(__file__).resolve().parents[1] / "src/abkit/golden/freeze_criteo.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
        elif isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
    assert {m for m in imported if m.startswith("abkit")} <= allowed


def test_freezer_writes_published_truth_and_refuses_to_overwrite(tmp_path: Path) -> None:
    raw = write_criteo_like(tmp_path / "c.csv.gz", n=500)
    root = tmp_path / "golden"
    written = freeze_criteo(raw, root, frozen_at="2026-11-13", expected_sha256=None)
    assert written == root / "criteo" / CASE_NAME
    (case,) = load_dataset(root)
    assert case.expected == PUBLISHED  # the file never sets the truth
    assert case.source["frozen_at"] == "2026-11-13"
    assert case.read_data()["n"].sum() == 500
    with pytest.raises(GoldenFormatError, match="already exists"):
        freeze_criteo(raw, root, frozen_at="2026-11-13", expected_sha256=None)
    assert freeze_criteo(raw, root, frozen_at="2026-11-14", force=True, expected_sha256=None)


def test_freezer_checks_the_raw_file(tmp_path: Path) -> None:
    raw = write_criteo_like(tmp_path / "c.csv.gz", n=30)
    with pytest.raises(ValueError, match="sha256"):
        freeze_criteo(raw, tmp_path / "golden")


@pytest.mark.skipif(not CRITEO_RAW.is_file(), reason="raw Criteo CSV not on this machine")
def test_committed_case_is_what_the_freezer_makes(tmp_path: Path) -> None:
    truth = json.loads((CASE_DIR / "truth.json").read_text(encoding="utf-8"))
    freeze_criteo(CRITEO_RAW, tmp_path, frozen_at=truth["source"]["frozen_at"])
    for name in ("data.csv", "truth.json"):
        committed = (CASE_DIR / name).read_bytes().replace(b"\r\n", b"\n")
        assert committed == (tmp_path / "criteo" / CASE_NAME / name).read_bytes(), name
