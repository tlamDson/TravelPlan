"""G-ref: the committed ``analytics/golden/v1`` cases and the freezer that made them.

The truth was computed by scipy / statsmodels (``abkit.golden.freeze_ref``),
never by the abkit engine. These tests re-run that computation and pin it to
the frozen files, so a silent edit to a ``truth.json`` is caught.
"""

import ast
import importlib.util
from pathlib import Path

import pytest
from conftest import GOLDEN_V1

from abkit.golden.case import GoldenFormatError, load_case, load_dataset
from abkit.golden.compare import compare_outputs
from abkit.golden.freeze_ref import STATSMODELS_METHODS, compute_reference, freeze, render_csv
from abkit.golden.methods import KNOWN_METHODS
from abkit.golden.ref_cases import REF_CASES

G_REF_GROUPS = {"welch", "delta", "cuped", "srm", "power", "bh"}
HAS_STATSMODELS = importlib.util.find_spec("statsmodels") is not None
NEEDS_STATSMODELS = "statsmodels is in the [golden] extra; CI installs core + dev only"


def _ids(cases):
    return [f"{c.group}/{c.name}" for c in cases]


def test_ref_cases_are_about_twenty_and_cover_every_g_ref_group() -> None:
    assert 20 <= len(REF_CASES) <= 25
    assert {c.group for c in REF_CASES} == G_REF_GROUPS
    assert len(set(_ids(REF_CASES))) == len(REF_CASES)
    assert {c.method for c in REF_CASES} <= KNOWN_METHODS


def test_committed_v1_holds_exactly_the_ref_cases() -> None:
    cases = load_dataset(GOLDEN_V1)
    assert [c.id for c in cases] == sorted(_ids(REF_CASES))
    for case in cases:
        assert case.source["tool"] in {"scipy", "statsmodels", "numpy+scipy"}
        assert case.source["version"]
        assert case.source["generator"] == "abkit.golden.freeze_ref"


def test_committed_data_matches_the_seeded_generators() -> None:
    for ref in REF_CASES:
        data_path = GOLDEN_V1 / ref.group / ref.name / "data.csv"
        if ref.make_data is None:
            assert not data_path.exists(), ref.name
            continue
        committed = data_path.read_text(encoding="utf-8")
        assert committed == render_csv(ref.make_data()), f"{ref.group}/{ref.name}"


@pytest.mark.parametrize("case_id", sorted(_ids(REF_CASES)))
def test_committed_truth_matches_scipy_and_statsmodels(case_id: str) -> None:
    case = load_case(GOLDEN_V1 / case_id)
    if case.method in STATSMODELS_METHODS and not HAS_STATSMODELS:
        pytest.skip(NEEDS_STATSMODELS)
    ref = compute_reference(case.method, case.read_data(), case.params)
    assert ref.decision == case.decision
    assert compare_outputs(case, {**ref.expected, "decision": ref.decision}) == []
    assert set(ref.expected) == set(case.expected)


def test_freezer_never_imports_the_abkit_engine() -> None:
    allowed = {"abkit.golden.case", "abkit.golden.ref_cases"}
    package = Path(__file__).resolve().parents[1] / "src/abkit/golden"
    for name in ("freeze_ref.py", "ref_cases.py"):
        tree = ast.parse((package / name).read_text(encoding="utf-8"))
        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module)
            elif isinstance(node, ast.Import):
                imported.update(alias.name for alias in node.names)
        assert {m for m in imported if m.startswith("abkit")} <= allowed, name


def test_compute_reference_rejects_unknown_methods() -> None:
    with pytest.raises(KeyError, match="nope"):
        compute_reference("nope", None, {})


def test_freeze_writes_a_loadable_dataset_and_refuses_to_overwrite(tmp_path: Path) -> None:
    subset = [next(c for c in REF_CASES if c.group == g) for g in ("welch", "srm")]
    written = freeze(tmp_path, subset, frozen_at="2026-11-13")
    assert written == [tmp_path / c.group / c.name for c in subset]
    cases = load_dataset(tmp_path)
    assert {c.id for c in cases} == set(_ids(subset))
    assert all(c.source["frozen_at"] == "2026-11-13" for c in cases)
    with pytest.raises(GoldenFormatError, match="already exists"):
        freeze(tmp_path, subset[:1], frozen_at="2026-11-13")
    assert freeze(tmp_path, subset[:1], frozen_at="2026-11-14", force=True)
