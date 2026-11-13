"""abkit decide label / kappa: Lam labels blinded readouts, then kappa vs the memo (PR 15b)."""

import csv
import json
import shutil
from pathlib import Path

import pytest
from conftest import GOLDEN_LATEST

from abkit.cli import main
from abkit.labeling import agreement, export_blinded, label_session, read_labels, to_run_records
from abkit.runs import read_runs


@pytest.fixture(scope="module")
def _export(tmp_path_factory) -> Path:
    out = tmp_path_factory.mktemp("decide")
    export_blinded(GOLDEN_LATEST, out)
    return out


@pytest.fixture
def export(_export: Path, tmp_path: Path) -> Path:
    out = tmp_path / "decide"
    shutil.copytree(_export, out)
    return out


def _answers(*values: str):
    it = iter(values)
    prompts: list[str] = []

    def ask(prompt: str) -> str:
        prompts.append(prompt)
        return next(it)

    return ask, prompts


def _key(export: Path) -> dict:
    return json.loads((export / "key.json").read_text(encoding="utf-8"))["readouts"]


def _write_labels(path: Path, labels: dict[str, str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["readout", "label", "labelled_at"])
        for rid, label in labels.items():
            w.writerow([rid, label, "2026-11-20T10:00:00+00:00"])


def test_session_shows_each_readout_and_saves_every_answer(export: Path) -> None:
    shown: list[str] = []
    ask, prompts = _answers("s", "x", "n", "q")
    done = label_session(export, export / "labels.csv", ask=ask, say=shown.append)
    assert done == 2
    labels = read_labels(export / "labels.csv")
    assert labels == {"R01": "ship", "R02": "no_ship"}
    first = (export / "readouts/R01.md").read_text(encoding="utf-8")
    assert any(first.strip() in s for s in shown)
    assert len(prompts) == 4  # the unknown answer "x" asked again
    assert any("s = ship" in p and "i = investigate" in p for p in prompts)


def test_session_resumes_after_the_last_saved_label(export: Path) -> None:
    labels = export / "labels.csv"
    label_session(export, labels, ask=_answers("s", "q")[0], say=lambda _: None)
    shown: list[str] = []
    label_session(export, labels, ask=_answers("i", "q")[0], say=shown.append)
    assert read_labels(labels) == {"R01": "ship", "R02": "investigate"}
    assert not any("# Readout R01\n" in s for s in shown)


def test_session_never_reads_the_key(export: Path) -> None:
    (export / "key.json").unlink()
    ask, _ = _answers(*(["n"] * 30))
    assert label_session(export, export / "labels.csv", ask=ask, say=lambda _: None) == 30
    assert len(read_labels(export / "labels.csv")) == 30


def test_session_stops_cleanly_on_end_of_input(export: Path) -> None:
    def ask(prompt: str) -> str:
        raise EOFError

    assert label_session(export, export / "labels.csv", ask=ask, say=lambda _: None) == 0


def test_read_labels_rejects_unknown_labels_and_duplicates(tmp_path: Path) -> None:
    path = tmp_path / "labels.csv"
    _write_labels(path, {"R01": "maybe"})
    with pytest.raises(ValueError, match="maybe"):
        read_labels(path)
    path.write_text("readout,label,labelled_at\nR01,ship,x\nR01,no_ship,y\n", encoding="utf-8")
    with pytest.raises(ValueError, match="R01"):
        read_labels(path)


def test_agreement_compares_lam_with_the_memo_and_the_p_only_baseline(export: Path) -> None:
    key = _key(export)
    # Lam agrees with the memo everywhere: kappa 1 for the memo.
    _write_labels(export / "labels.csv", {rid: e["memo"] for rid, e in key.items()})
    result = agreement(export, export / "labels.csv")
    assert result.n == 30
    assert result.memo.kappa == pytest.approx(1.0)
    # The baseline never says "investigate", so it misses at least the SRM readouts.
    assert result.baseline.kappa < 1.0
    assert result.simulated == sum(e["simulated"] for e in key.values())
    assert result.disagreements_baseline and all(
        key[rid]["baseline"] != lam for rid, lam, _ in result.disagreements_baseline
    )


def test_agreement_needs_every_readout_labelled_unless_partial(export: Path) -> None:
    key = _key(export)
    some = dict(list((rid, e["memo"]) for rid, e in key.items())[:12])
    _write_labels(export / "labels.csv", some)
    with pytest.raises(ValueError, match="18 of 30"):
        agreement(export, export / "labels.csv")
    assert agreement(export, export / "labels.csv", partial=True).n == 12


def test_agreement_rejects_labels_for_readouts_not_in_the_export(export: Path) -> None:
    _write_labels(export / "labels.csv", {"R99": "ship"})
    with pytest.raises(ValueError, match="R99"):
        agreement(export, export / "labels.csv", partial=True)


def test_cli_kappa_prints_and_records_m11(export: Path, tmp_path: Path, capsys) -> None:
    key = _key(export)
    _write_labels(export / "labels.csv", {rid: e["memo"] for rid, e in key.items()})
    runs = tmp_path / "runs.csv"
    assert main(["decide", "kappa", str(export), "--record", "--runs-csv", str(runs)]) == 0
    out = capsys.readouterr().out
    assert "memo vs Lam" in out and "p < 0.05 only vs Lam" in out
    rows = read_runs(runs)
    assert [r.metric_id for r in rows] == ["M11", "M11"]
    assert [r.metric for r in rows] == ["decision_kappa_memo", "decision_kappa_p05_baseline"]
    assert rows[0].value == pytest.approx(1.0)
    assert all(r.n == 30 and r.pr == "15b" and r.simulated for r in rows)
    assert "real=2" in rows[0].notes and "simulated=28" in rows[0].notes


def test_cli_kappa_record_takes_the_rater_label(export: Path, tmp_path: Path) -> None:
    key = _key(export)
    _write_labels(export / "labels.csv", {rid: e["memo"] for rid, e in key.items()})
    runs = tmp_path / "runs.csv"
    rater = "LLM subagent, no context, owner-reviewed"
    argv = ["decide", "kappa", str(export), "--record", "--runs-csv", str(runs)]
    assert main([*argv, "--rater", rater]) == 0
    rows = read_runs(runs)
    assert all(f"rater={rater}" in r.notes for r in rows)
    assert all("rater=Lam" not in r.notes for r in rows)


def test_to_run_records_rater_defaults_to_lam(export: Path) -> None:
    key = _key(export)
    _write_labels(export / "labels.csv", {rid: e["memo"] for rid, e in key.items()})
    result = agreement(export, export / "labels.csv")
    assert all("rater=Lam " in r.notes for r in to_run_records(result))
    assert all("rater=X y " in r.notes for r in to_run_records(result, rater="X y"))


def test_cli_kappa_exits_two_without_labels(export: Path, capsys) -> None:
    assert main(["decide", "kappa", str(export)]) == 2
    assert "labels" in capsys.readouterr().err


def test_cli_export_writes_into_a_new_directory(tmp_path: Path) -> None:
    out = tmp_path / "fresh"
    assert main(["decide", "export", "--golden", str(GOLDEN_LATEST), "--out", str(out)]) == 0
    assert len(list((out / "readouts").iterdir())) == 30
    assert main(["decide", "export", "--golden", str(GOLDEN_LATEST), "--out", str(out)]) == 2
