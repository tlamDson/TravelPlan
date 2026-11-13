"""G-ref: the committed golden cases (latest ``v2``, ``v1`` kept) and the freezer that made them.

The truth was computed by scipy / statsmodels (``abkit.golden.freeze_ref``),
never by the abkit engine. These tests re-run that computation and pin it to
the frozen files, so a silent edit to a ``truth.json`` is caught.
"""

import ast
import importlib.util
from pathlib import Path

import pytest
from conftest import GOLDEN_LATEST, GOLDEN_V1

from abkit.golden.case import GoldenFormatError, load_case, load_dataset
from abkit.golden.compare import compare_outputs
from abkit.golden.freeze_ref import DEFAULT_ROOT, freeze, render_csv
from abkit.golden.methods import KNOWN_METHODS
from abkit.golden.ref_cases import REF_CASES
from abkit.golden.ref_truth import STATSMODELS_METHODS, compute_reference

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


def test_latest_g_ref_groups_hold_exactly_the_ref_cases() -> None:
    cases = [c for c in load_dataset(GOLDEN_LATEST) if c.group in G_REF_GROUPS]
    assert [c.id for c in cases] == sorted(_ids(REF_CASES))
    for case in cases:
        assert case.source["tool"] in {"scipy", "statsmodels", "numpy+scipy"}
        assert case.source["version"]
        assert case.source["generator"] == "abkit.golden.freeze_ref"


def test_committed_data_matches_the_seeded_generators() -> None:
    for ref in REF_CASES:
        data_path = GOLDEN_LATEST / ref.group / ref.name / "data.csv"
        if ref.make_data is None:
            assert not data_path.exists(), ref.name
            continue
        committed = data_path.read_text(encoding="utf-8")
        assert committed == render_csv(ref.make_data()), f"{ref.group}/{ref.name}"


@pytest.mark.parametrize("case_id", sorted(_ids(REF_CASES)))
def test_committed_truth_matches_scipy_and_statsmodels(case_id: str) -> None:
    case = load_case(GOLDEN_LATEST / case_id)
    if case.method in STATSMODELS_METHODS and not HAS_STATSMODELS:
        pytest.skip(NEEDS_STATSMODELS)
    ref = compute_reference(case.method, case.read_data(), case.params)
    assert ref.decision == case.decision
    assert compare_outputs(case, {**ref.expected, "decision": ref.decision}) == []
    assert set(ref.expected) == set(case.expected)


# v2 re-froze these: tight brentq on statsmodels power for the t-test solves (v1 stopped at
# statsmodels' xtol=1e-5), and the cdflib-vs-boost tolerance for the noncentral t power.
REFROZEN_IN_V2 = {"power/ttest-power", "power/ttest-sample-size", "power/ttest-mde"}


def test_freezer_writes_to_the_latest_version_by_default() -> None:
    assert DEFAULT_ROOT == GOLDEN_LATEST


def _files(root: Path) -> dict[str, bytes]:
    files = (p for p in root.rglob("*") if p.is_file())
    # Compare content, not the checkout's line endings (core.autocrlf on Windows).
    return {p.relative_to(root).as_posix(): p.read_bytes().replace(b"\r\n", b"\n") for p in files}


def test_v1_is_kept_and_v2_changes_only_the_refrozen_cases() -> None:
    v1 = _files(GOLDEN_V1)
    # v2 also holds G-sim (``sim-*``, ``subsets.json``, PR 13a) and G-public (``public/``,
    # PR 17); compare the G-ref part.
    v2 = {k: v for k, v in _files(GOLDEN_LATEST).items() if k.split("/")[0] in G_REF_GROUPS}
    assert v1.keys() == v2.keys()
    changed = {"/".join(k.split("/")[:2]) for k in v1 if v1[k] != v2[k]}
    assert changed == REFROZEN_IN_V2
    assert len(load_dataset(GOLDEN_V1)) == len(REF_CASES)


@pytest.mark.parametrize("case_id", ["power/ttest-sample-size", "power/ttest-mde"])
def test_solved_truth_reaches_the_target_power(case_id: str) -> None:
    if not HAS_STATSMODELS:
        pytest.skip(NEEDS_STATSMODELS)
    from statsmodels.stats.power import TTestIndPower

    case = load_case(GOLDEN_LATEST / case_id)
    kwargs = {k: case.params.get(k) for k in ("effect_size", "nobs1", "ratio", "alternative")}
    kwargs.update(case.expected, alpha=case.params["alpha"])
    assert float(TTestIndPower().power(**kwargs)) == pytest.approx(case.params["power"], abs=1e-9)


def test_freezer_never_imports_the_abkit_engine() -> None:
    allowed = {"abkit.golden.case", "abkit.golden.ref_cases", "abkit.golden.ref_truth"}
    package = Path(__file__).resolve().parents[1] / "src/abkit/golden"
    for name in ("freeze_ref.py", "ref_cases.py", "ref_truth.py"):
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
