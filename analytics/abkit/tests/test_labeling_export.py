"""abkit.labeling export: ~30 readouts with abkit's conclusion hidden (G-decide, PR 15b)."""

import json
from collections import Counter
from pathlib import Path

import pytest
from conftest import GOLDEN_LATEST, REPO_ROOT

from abkit.golden.case import load_case
from abkit.labeling import (
    DECIDE_ROOT,
    REAL_READOUTS,
    SAMPLE,
    export_blinded,
    memo_label,
    select_cases,
)
from abkit.readout import load_readout_input

COMMITTED = REPO_ROOT / "analytics/golden/decide/v1"
#: Words of abkit's own conclusion; none may reach a blinded readout.
CONCLUSION_WORDS = (
    "Decision:",
    "SHIP",
    "BLOCKED",
    "withheld",
    "novelty",
    "excludes zero",
    "includes zero",
    "PASS",
    "FAIL",
    "differ",
    "ignored",
)


@pytest.fixture(scope="module")
def exported(tmp_path_factory) -> Path:
    out = tmp_path_factory.mktemp("decide")
    export_blinded(GOLDEN_LATEST, out)
    return out


def _key(root: Path) -> dict:
    return json.loads((root / "key.json").read_text(encoding="utf-8"))


def test_default_export_lives_next_to_the_golden_versions() -> None:
    assert DECIDE_ROOT == COMMITTED


def test_selection_is_stratified_over_every_g_sim_group_plus_real_readouts() -> None:
    ids = select_cases(GOLDEN_LATEST)
    assert len(ids) == len(set(ids)) == 30
    groups = Counter(i.split("/")[0] for i in ids)
    assert dict(groups) == {**SAMPLE, "hillstrom": len(REAL_READOUTS)}
    assert set(SAMPLE) == {
        "sim-aa",
        "sim-effect",
        "sim-long-tail",
        "sim-novelty",
        "sim-peeking",
        "sim-ratio",
        "sim-srm",
    }
    assert select_cases(GOLDEN_LATEST) == ids
    assert select_cases(GOLDEN_LATEST, seed=7) != ids


def test_export_writes_30_numbered_readouts_and_a_key(exported: Path) -> None:
    files = sorted(p.name for p in (exported / "readouts").iterdir())
    assert files == [f"R{i:02d}.md" for i in range(1, 31)]
    key = _key(exported)
    assert sorted(key["readouts"]) == [f"R{i:02d}" for i in range(1, 31)]
    assert {e["case"] for e in key["readouts"].values()} == set(select_cases(GOLDEN_LATEST))
    assert key["labels"] == ["ship", "no_ship", "investigate"]
    real = [e for e in key["readouts"].values() if not e["simulated"]]
    assert sorted(e["case"] for e in real) == sorted(REAL_READOUTS)


def test_blind_order_is_shuffled_not_grouped(exported: Path) -> None:
    cases = [_key(exported)["readouts"][f"R{i:02d}"]["case"] for i in range(1, 31)]
    assert cases != sorted(cases)


def test_key_holds_the_memo_decision_and_the_p_only_baseline(exported: Path) -> None:
    for entry in _key(exported)["readouts"].values():
        if entry["simulated"]:
            readout = load_readout_input(GOLDEN_LATEST / entry["case"]).readout()
            assert entry["memo"] == memo_label(readout.decision)
        assert entry["memo"] in ("ship", "no_ship", "investigate")
        # Baseline of M11: ship whenever p < 0.05 and the lift is positive, SRM or not.
        assert entry["baseline"] in ("ship", "no_ship")
    srm = [e for e in _key(exported)["readouts"].values() if e["case"].startswith("sim-srm/")]
    assert srm and all(e["memo"] == "investigate" for e in srm)


def test_memo_label_maps_invalid_to_investigate() -> None:
    assert memo_label("ship") == "ship"
    assert memo_label("no_ship") == "no_ship"
    assert memo_label("invalid") == "investigate"
    with pytest.raises(ValueError):
        memo_label("harm")


def test_blinded_readouts_never_show_abkits_conclusion(exported: Path) -> None:
    key = _key(exported)["readouts"]
    for blind_id, entry in key.items():
        text = (exported / "readouts" / f"{blind_id}.md").read_text(encoding="utf-8")
        assert text.startswith(f"# Readout {blind_id}\n")
        for word in CONCLUSION_WORDS:
            assert word not in text, (blind_id, word)
        case = load_case(GOLDEN_LATEST / entry["case"])
        assert case.id not in text and case.name not in text
        assert case.description not in text
        assert "## Your call: ship, no ship, or investigate" in text


def test_every_readout_shows_its_evidence_even_when_srm_fails(exported: Path) -> None:
    for blind_id, entry in _key(exported)["readouts"].items():
        text = (exported / "readouts" / f"{blind_id}.md").read_text(encoding="utf-8")
        assert "## Sample ratio" in text and "Chi-square" in text
        assert "## Primary metric:" in text
        banner = "Simulated data (virtual users)" if entry["simulated"] else "Real users"
        assert banner in text
        group = entry["case"].split("/")[0]
        assert ("## Early window" in text) == (group == "sim-novelty")
        assert ("## Interim looks" in text) == (group == "sim-peeking")


def test_export_refuses_to_overwrite_without_force(exported: Path) -> None:
    with pytest.raises(FileExistsError):
        export_blinded(GOLDEN_LATEST, exported)
    export_blinded(GOLDEN_LATEST, exported, force=True)


def test_committed_export_is_exactly_what_the_exporter_writes(exported: Path) -> None:
    assert (COMMITTED / "key.json").read_bytes() == (exported / "key.json").read_bytes()
    committed = sorted((COMMITTED / "readouts").iterdir())
    assert [p.name for p in committed] == sorted(p.name for p in (exported / "readouts").iterdir())
    for path in committed:
        assert path.read_bytes() == (exported / "readouts" / path.name).read_bytes(), path.name
