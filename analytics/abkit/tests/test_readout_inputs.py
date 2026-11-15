"""abkit.readout.inputs, the ``readout`` golden method and ``abkit readout`` (PR 15)."""

import json
import shutil
from pathlib import Path

import pytest
from conftest import GOLDEN_LATEST

from abkit.cli import main
from abkit.golden.runner import Status, run_golden
from abkit.readout import list_readout_cases, load_readout_input

SRM_CASE = GOLDEN_LATEST / "sim-srm/loss-15-aa"
SHIP_CASE = GOLDEN_LATEST / "sim-effect/graded-by-persona"


def test_every_g_sim_case_passes_through_the_readout() -> None:
    report = run_golden(GOLDEN_LATEST)
    sim = [r for r in report.results if r.method == "readout"]
    assert len(sim) == 50
    assert [(r.case_id, r.details) for r in sim if r.status is not Status.PASS] == []


def test_ci_fast_subset_runs_the_readout_cases() -> None:
    report = run_golden(GOLDEN_LATEST, subset="ci-fast")
    sim = [r for r in report.results if r.method == "readout"]
    assert sim and all(r.status is Status.PASS for r in sim)


def test_case_input_carries_params_but_never_the_frozen_answer() -> None:
    inp = load_readout_input(SHIP_CASE)
    assert inp.title == "sim-effect/graded-by-persona"
    assert inp.simulated is True
    assert inp.params["by_persona"] is True
    assert set(inp.data) >= {"variant", "persona", "saves"}
    assert not hasattr(inp, "expected") and not hasattr(inp, "decision")


def test_the_memo_does_not_depend_on_the_truth_decision(tmp_path: Path) -> None:
    copy = tmp_path / "sim-effect/graded-by-persona"
    shutil.copytree(SHIP_CASE, copy)
    truth = json.loads((copy / "truth.json").read_text(encoding="utf-8"))
    truth["decision"], truth["expected"] = "no_ship", {"srm": True}
    (copy / "truth.json").write_text(json.dumps(truth), encoding="utf-8")
    assert load_readout_input(copy).memo() == load_readout_input(SHIP_CASE).memo()


def test_csv_input_needs_params_and_an_explicit_data_kind(tmp_path: Path) -> None:
    params = json.loads((SHIP_CASE / "truth.json").read_text(encoding="utf-8"))["params"]
    params_path = tmp_path / "params.json"
    params_path.write_text(json.dumps(params), encoding="utf-8")
    csv = SHIP_CASE / "data.csv"
    with pytest.raises(ValueError, match="params"):
        load_readout_input(csv, simulated=True)
    with pytest.raises(ValueError, match="simulated"):
        load_readout_input(csv, params_path=params_path)
    inp = load_readout_input(csv, params_path=params_path, simulated=False)
    assert inp.title == "data" and inp.simulated is False
    assert "## Decision: SHIP" in inp.memo()


def test_a_case_of_another_method_is_refused() -> None:
    with pytest.raises(ValueError, match="readout"):
        load_readout_input(GOLDEN_LATEST / "welch/aa-null")


def test_list_readout_cases_finds_the_fifty_g_sim_cases() -> None:
    cases = list_readout_cases(GOLDEN_LATEST)
    assert len(cases) == 50
    assert cases == sorted(cases)
    assert SRM_CASE in cases and GOLDEN_LATEST / "welch/aa-null" not in cases


def test_cli_prints_a_blocked_memo_for_an_srm_case(capsys) -> None:
    assert main(["readout", str(SRM_CASE)]) == 0
    out = capsys.readouterr().out
    assert "CONCLUSION BLOCKED" in out and "virtual users" in out


def test_cli_writes_the_memo_to_a_file(tmp_path: Path, capsys) -> None:
    out_file = tmp_path / "memo.md"
    assert main(["readout", str(SHIP_CASE), "--out", str(out_file)]) == 0
    assert out_file.read_text(encoding="utf-8").startswith(
        "# Readout: sim-effect/graded-by-persona"
    )


def test_cli_exits_two_on_bad_input(tmp_path: Path, capsys) -> None:
    assert main(["readout", str(SHIP_CASE / "data.csv")]) == 2
    assert "params" in capsys.readouterr().err


def test_a_simulated_case_cannot_be_relabelled_as_real() -> None:
    with pytest.raises(ValueError, match="simulated"):
        load_readout_input(SHIP_CASE, simulated=False)
