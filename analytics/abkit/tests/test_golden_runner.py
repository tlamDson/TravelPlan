from pathlib import Path

from conftest import write_case

from abkit.golden.methods import IMPLEMENTATIONS, KNOWN_METHODS
from abkit.golden.runner import Status, run_golden


def _good(data, params):
    assert params["alpha"] == 0.05
    estimate = data["value"][2:].mean() - data["value"][:2].mean()
    return {"estimate": estimate, "p_value": 0.25, "decision": "fail_to_reject"}


def _bad(data, params):
    return {"estimate": 9.0, "p_value": 0.25, "decision": "fail_to_reject"}


def _boom(data, params):
    raise RuntimeError("engine exploded")


def test_known_methods_cover_the_g_ref_groups() -> None:
    assert {
        "welch_ttest",
        "delta_ratio",
        "cuped",
        "srm_chisquare",
        "power_ttest_ind",
        "sample_size_ttest_ind",
        "mde_ttest_ind",
        "sample_size_proportions",
        "bh_fdr",
    } <= KNOWN_METHODS
    assert set(IMPLEMENTATIONS) <= KNOWN_METHODS


def test_each_status_is_reported(tmp_path: Path) -> None:
    write_case(tmp_path, "welch", "good")
    write_case(tmp_path, "welch", "bad", method="cuped")
    write_case(tmp_path, "welch", "boom", method="delta_ratio")
    write_case(tmp_path, "welch", "missing", method="srm_chisquare")
    report = run_golden(
        tmp_path, implementations={"welch_ttest": _good, "cuped": _bad, "delta_ratio": _boom}
    )
    by_id = {r.case_id: r for r in report.results}
    assert by_id["welch/good"].status is Status.PASS
    assert by_id["welch/bad"].status is Status.FAIL
    assert "estimate" in by_id["welch/bad"].details[0]
    assert by_id["welch/boom"].status is Status.ERROR
    assert "engine exploded" in by_id["welch/boom"].details[0]
    assert by_id["welch/missing"].status is Status.MISSING
    assert report.counts == {Status.PASS: 1, Status.FAIL: 1, Status.MISSING: 1, Status.ERROR: 1}


def test_report_ok_ignores_missing_unless_strict(tmp_path: Path) -> None:
    write_case(tmp_path, "welch", "good")
    write_case(tmp_path, "welch", "missing", method="srm_chisquare")
    report = run_golden(tmp_path, implementations={"welch_ttest": _good})
    assert report.ok(strict=False)
    assert not report.ok(strict=True)


def test_report_is_not_ok_on_fail(tmp_path: Path) -> None:
    write_case(tmp_path, "welch", "bad")
    report = run_golden(tmp_path, implementations={"welch_ttest": _bad})
    assert not report.ok(strict=False)


def test_format_lists_every_case_and_a_summary(tmp_path: Path) -> None:
    write_case(tmp_path, "welch", "good")
    write_case(tmp_path, "welch", "bad", method="cuped")
    text = run_golden(tmp_path, implementations={"welch_ttest": _good, "cuped": _bad}).format()
    lines = text.splitlines()
    assert any(line.startswith("PASS") and "welch/good" in line for line in lines)
    assert any(line.startswith("FAIL") and "welch/bad" in line for line in lines)
    assert any("estimate" in line for line in lines)
    assert lines[-1] == "summary: 1 pass, 1 fail, 0 missing, 0 error (2 cases)"


def test_default_implementations_come_from_the_registry(tmp_path: Path, monkeypatch) -> None:
    write_case(tmp_path)
    monkeypatch.delitem(IMPLEMENTATIONS, "welch_ttest", raising=False)
    assert run_golden(tmp_path).results[0].status is Status.MISSING
    monkeypatch.setitem(IMPLEMENTATIONS, "welch_ttest", _good)
    assert run_golden(tmp_path).results[0].status is Status.PASS
