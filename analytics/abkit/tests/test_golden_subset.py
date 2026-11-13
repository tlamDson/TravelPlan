"""Named subsets of a golden dataset (``<root>/subsets.json``), e.g. the fast CI subset."""

import json
from pathlib import Path

import pytest
from conftest import GOLDEN_LATEST, write_case

from abkit.cli import main
from abkit.golden.case import GoldenFormatError, load_dataset
from abkit.golden.methods import IMPLEMENTATIONS
from abkit.golden.runner import Status, run_golden
from abkit.golden.subsets import SUBSETS_FILE, load_subset

G_REF_GROUPS = {"welch", "delta", "cuped", "srm", "power", "bh"}
G_SIM_GROUPS = {
    "sim-aa",
    "sim-effect",
    "sim-srm",
    "sim-novelty",
    "sim-ratio",
    "sim-peeking",
    "sim-long-tail",
}


def _good(data, params):
    return {"estimate": 1.0, "p_value": 0.25, "decision": "fail_to_reject"}


def _write_subsets(root: Path, subsets) -> None:
    (root / SUBSETS_FILE).write_text(json.dumps(subsets), encoding="utf-8")


@pytest.fixture
def dataset(tmp_path: Path) -> Path:
    write_case(tmp_path, "welch", "a")
    write_case(tmp_path, "welch", "b")
    write_case(tmp_path, "cuped", "c", method="cuped")
    return tmp_path


def test_a_subset_entry_is_a_whole_group_or_one_case(dataset: Path) -> None:
    _write_subsets(dataset, {"fast": {"description": "quick", "entries": ["cuped", "welch/b"]}})
    assert load_subset(dataset, "fast") == frozenset({"cuped/c", "welch/b"})


@pytest.mark.parametrize(
    ("subsets", "message"),
    [
        ({"other": {"description": "x", "entries": ["welch"]}}, "no subset 'fast'"),
        ({"fast": {"description": "x", "entries": ["nope"]}}, "matches no case"),
        ({"fast": {"description": "x", "entries": ["welch/zzz"]}}, "matches no case"),
        ({"fast": {"description": "x", "entries": []}}, "non-empty list"),
        ({"fast": {"entries": ["welch"]}}, "description"),
        ({"fast": {"description": "x", "entries": ["welch"], "extra": 1}}, "unknown key"),
    ],
)
def test_malformed_or_unknown_subsets_raise(dataset: Path, subsets, message: str) -> None:
    _write_subsets(dataset, subsets)
    with pytest.raises(GoldenFormatError, match=message):
        load_subset(dataset, "fast")


def test_a_dataset_without_subsets_file_has_no_subsets(dataset: Path) -> None:
    with pytest.raises(GoldenFormatError, match=SUBSETS_FILE):
        load_subset(dataset, "fast")


def test_run_golden_runs_only_the_subset(dataset: Path) -> None:
    _write_subsets(dataset, {"fast": {"description": "quick", "entries": ["welch/a"]}})
    report = run_golden(dataset, implementations={"welch_ttest": _good}, subset="fast")
    assert [r.case_id for r in report.results] == ["welch/a"]
    assert report.results[0].status is Status.PASS
    assert report.subset == "fast"
    assert "subset fast" in report.format().splitlines()[0]


def test_cli_subset_flag(dataset: Path, monkeypatch, capsys) -> None:
    _write_subsets(dataset, {"fast": {"description": "quick", "entries": ["welch"]}})
    monkeypatch.setitem(IMPLEMENTATIONS, "welch_ttest", _good)
    assert main(["golden", str(dataset), "--subset", "fast"]) == 0
    assert "summary: 2 pass, 0 fail, 0 missing, 0 error (2 cases)" in capsys.readouterr().out
    assert main(["golden", str(dataset), "--subset", "nope"]) == 2


def test_committed_ci_fast_subset_has_every_g_ref_group_and_each_g_sim_group() -> None:
    ids = load_subset(GOLDEN_LATEST, "ci-fast")
    all_cases = load_dataset(GOLDEN_LATEST)
    groups = {c.group for c in all_cases}
    assert groups == G_REF_GROUPS | G_SIM_GROUPS
    by_group = {g: {c.id for c in all_cases if c.group == g} for g in groups}
    for group in G_REF_GROUPS:
        assert by_group[group] <= ids, group
    for group in G_SIM_GROUPS:
        chosen = by_group[group] & ids
        assert 1 <= len(chosen) < len(by_group[group]), group
    sim_ids = {i for i in ids if i.split("/")[0] in G_SIM_GROUPS}
    assert len(sim_ids) <= 14
