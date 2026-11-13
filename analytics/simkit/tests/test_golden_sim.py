"""G-sim: the committed ``analytics/golden/v1/sim-*`` cases, their table and their freezer.

Every committed case is re-screened from its ``data.csv`` (scipy only, fast). The ``ci-fast``
cases are also rebuilt from their seed and must match byte for byte; set
``SIMKIT_GOLDEN_FULL=1`` to rebuild all of them (minutes, nightly).
"""

import ast
import json
import os
from collections import Counter
from pathlib import Path

import pytest
from abkit.golden.case import GoldenFormatError, load_case
from abkit.golden.subsets import load_subset

from simkit.freeze_golden import build_case, freeze
from simkit.golden_cases import GROUP_SIZES, SIM_CASES, SimCase
from simkit.golden_reference import screen, verdict

REPO_ROOT = Path(__file__).resolve().parents[3]
GOLDEN_V1 = REPO_ROOT / "analytics/golden/v1"
FULL = os.environ.get("SIMKIT_GOLDEN_FULL") == "1"
BY_ID = {c.id: c for c in SIM_CASES}
DECISION = {"ship": "ship", "harm": "no_ship", "flat": "no_ship", "invalid": "invalid"}


def _rebuilt_ids() -> list[str]:
    return sorted(BY_ID if FULL else (c.id for c in SIM_CASES if c.ci_fast))


def test_the_table_has_fifty_cases_in_the_planned_groups() -> None:
    assert GROUP_SIZES == {
        "sim-aa": 10,
        "sim-effect": 15,
        "sim-srm": 5,
        "sim-novelty": 5,
        "sim-ratio": 5,
        "sim-peeking": 5,
        "sim-long-tail": 5,
    }
    assert Counter(c.group for c in SIM_CASES) == GROUP_SIZES
    assert len(BY_ID) == len(SIM_CASES) == 50
    assert len({c.first_seed for c in SIM_CASES}) == 50
    assert sum(c.ci_fast for c in SIM_CASES) == len(GROUP_SIZES)
    assert {c.group for c in SIM_CASES if c.ci_fast} == set(GROUP_SIZES)


def test_effect_cases_include_persona_specific_and_harmful_lifts() -> None:
    effect = [c for c in SIM_CASES if c.group == "sim-effect"]
    assert sum(c.by_persona for c in effect) >= 3
    assert any(set(c.lift) != {"browser", "planner", "power"} for c in effect if c.lift)
    assert any(c.verdict == "harm" for c in effect)


def test_the_right_decision_comes_from_the_planted_parameters_only() -> None:
    for case in SIM_CASES:
        if case.exposure_loss > 0:
            assert case.verdict == "invalid", case.id
        elif any(v > 0 for v in case.lift.values()):
            assert case.verdict == "ship", case.id
        elif any(v < 0 for v in case.lift.values()):
            assert case.verdict == "harm", case.id
        else:
            assert case.verdict == "flat", case.id
        assert case.decision == DECISION[case.verdict]
    groups = {g: {c.verdict for c in SIM_CASES if c.group == g} for g in GROUP_SIZES}
    assert groups["sim-aa"] == {"flat"}
    assert groups["sim-srm"] == {"invalid"}
    assert groups["sim-peeking"] == {"flat"}
    assert "flat" in groups["sim-novelty"] and "ship" in groups["sim-novelty"]
    assert all(c.novelty > 0 for c in SIM_CASES if c.group == "sim-novelty")


def test_committed_sim_groups_hold_exactly_the_table() -> None:
    committed = sorted(
        f"{g.name}/{d.name}" for g in GOLDEN_V1.glob("sim-*") for d in g.iterdir() if d.is_dir()
    )
    assert committed == sorted(BY_ID)


@pytest.mark.parametrize("case_id", sorted(BY_ID))
def test_committed_case_is_screened_and_labelled_from_its_parameters(case_id: str) -> None:
    sim_case = BY_ID[case_id]
    case = load_case(GOLDEN_V1 / case_id)
    assert case.method == "readout"
    assert case.decision == sim_case.decision
    assert case.params == sim_case.params()
    assert case.source["generator"] == "simkit.freeze_golden"
    assert case.source["simulated"] is True
    assert case.source["screening"]["first_seed"] == sim_case.first_seed
    assert case.source["seed"] == sim_case.first_seed + case.source["screening"]["attempts"] - 1
    raw = json.loads((GOLDEN_V1 / case_id / "truth.json").read_text(encoding="utf-8"))
    data = case.read_data()
    assert verdict(sim_case, data).outcome == sim_case.verdict
    assert screen(sim_case, data, raw["expected"], raw["tolerance"]) == []


@pytest.mark.parametrize("case_id", _rebuilt_ids())
def test_committed_case_rebuilds_byte_for_byte_from_its_seed(case_id: str) -> None:
    case_dir = GOLDEN_V1 / case_id
    committed = json.loads((case_dir / "truth.json").read_text(encoding="utf-8"))
    built = build_case(BY_ID[case_id], committed["source"]["seed"])
    assert built.problems == []
    assert built.csv == (case_dir / "data.csv").read_text(encoding="utf-8")
    committed["source"].pop("frozen_at")
    assert built.truth == committed


def test_ci_fast_subset_lists_the_flagged_sim_cases() -> None:
    chosen = {i for i in load_subset(GOLDEN_V1, "ci-fast") if i.startswith("sim-")}
    assert chosen == {c.id for c in SIM_CASES if c.ci_fast}


def test_freeze_skips_rejected_seeds_and_refuses_to_overwrite(tmp_path: Path) -> None:
    case = SimCase(
        group="sim-aa",
        name="tiny",
        description="A tiny A/A case.",
        first_seed=11,
        users=400,
        days=10,
        window_days=5,
    )
    [case_dir] = freeze(tmp_path, [case], frozen_at="2026-11-13")
    golden = load_case(case_dir)
    assert golden.decision == "no_ship"
    assert golden.source["frozen_at"] == "2026-11-13"
    seed = golden.source["seed"]
    for rejected in range(case.first_seed, seed):
        assert build_case(case, rejected).problems, rejected
    with pytest.raises(GoldenFormatError, match="already exists"):
        freeze(tmp_path, [case], frozen_at="2026-11-13")
    assert freeze(tmp_path, [case], frozen_at="2026-11-14", force=True)


def test_freeze_gives_up_when_no_seed_passes_screening(tmp_path: Path) -> None:
    hopeless = SimCase(
        group="sim-effect",
        name="hopeless",
        description="A lift far too small to detect.",
        first_seed=1,
        users=200,
        days=10,
        window_days=5,
        lift={"browser": 0.01},
    )
    with pytest.raises(ValueError, match="no seed"):
        freeze(tmp_path, [hopeless], max_attempts=2)
    assert not (tmp_path / "sim-effect/hopeless").exists()


def test_freezer_uses_only_the_golden_format_from_abkit() -> None:
    allowed = {"abkit.golden.case", "abkit.golden.freeze_ref", "abkit.assignment"}
    package = Path(__file__).resolve().parents[1] / "src/simkit"
    for name in ("golden_cases.py", "golden_truth.py", "golden_reference.py", "freeze_golden.py"):
        tree = ast.parse((package / name).read_text(encoding="utf-8"))
        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module)
            elif isinstance(node, ast.Import):
                imported.update(alias.name for alias in node.names)
        assert {m for m in imported if m.startswith("abkit")} <= allowed, name
