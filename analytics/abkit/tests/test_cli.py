import subprocess
import sys
from pathlib import Path

from conftest import GOLDEN_LATEST, write_case

from abkit.cli import main
from abkit.golden.methods import IMPLEMENTATIONS


def _good(data, params):
    return {"estimate": 1.0, "p_value": 0.25, "decision": "fail_to_reject"}


def _bad(data, params):
    return {"estimate": 2.0, "p_value": 0.25, "decision": "fail_to_reject"}


def test_golden_defaults_to_the_latest_committed_dataset() -> None:
    from abkit.cli import DEFAULT_GOLDEN_ROOT

    assert DEFAULT_GOLDEN_ROOT == GOLDEN_LATEST


def test_golden_exits_zero_and_prints_report_when_all_pass(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    write_case(tmp_path)
    monkeypatch.setitem(IMPLEMENTATIONS, "welch_ttest", _good)
    assert main(["golden", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "PASS" in out and "welch/tiny" in out
    assert "summary: 1 pass, 0 fail, 0 missing, 0 error (1 cases)" in out


def test_golden_exits_one_on_a_failing_case(tmp_path: Path, monkeypatch, capsys) -> None:
    write_case(tmp_path)
    monkeypatch.setitem(IMPLEMENTATIONS, "welch_ttest", _bad)
    assert main(["golden", str(tmp_path)]) == 1
    assert "FAIL" in capsys.readouterr().out


def test_missing_implementations_fail_only_with_strict(tmp_path: Path, monkeypatch) -> None:
    write_case(tmp_path)
    monkeypatch.delitem(IMPLEMENTATIONS, "welch_ttest", raising=False)
    assert main(["golden", str(tmp_path)]) == 0
    assert main(["golden", str(tmp_path), "--strict"]) == 1


def test_golden_exits_two_on_a_malformed_dataset(tmp_path: Path, capsys) -> None:
    write_case(tmp_path, schema_version=99)
    assert main(["golden", str(tmp_path)]) == 2
    assert "schema_version" in capsys.readouterr().err


def test_python_dash_m_abkit_golden_runs_the_latest_dataset() -> None:
    proc = subprocess.run(
        [sys.executable, "-m", "abkit", "golden", str(GOLDEN_LATEST)],
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert proc.stdout.splitlines()[-1].startswith("summary: ")
