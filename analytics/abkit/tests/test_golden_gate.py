"""The golden gate: the clean engine passes, every planted mutant is blocked (M10)."""

from pathlib import Path

import pytest
from conftest import GOLDEN_LATEST, write_case
from scipy import stats

from abkit.golden.gate import GATE_SUBSET, GateReport, RunOutcome, check_package, run_gate
from abkit.golden.mutants import MUTANTS, Mutant

CONTROL, TREATMENT = [1.0, 2.0, 4.0], [2.5, 3.0, 6.5]


def _tiny_root(root: Path, p_value: float | None = None) -> Path:
    """One Welch case whose truth comes from scipy, never abkit."""
    ref = stats.ttest_ind(TREATMENT, CONTROL, equal_var=False)
    rows = [f"control,{v}" for v in CONTROL] + [f"treatment,{v}" for v in TREATMENT]
    write_case(
        root,
        csv_text="variant,value\n" + "\n".join(rows) + "\n",
        expected={
            "estimate": sum(TREATMENT) / 3 - sum(CONTROL) / 3,
            "p_value": float(ref.pvalue) if p_value is None else p_value,
        },
        decision="fail_to_reject",
    )
    return root


#: Flips the sign of every Welch estimate: the tiny case must catch it.
SIGN_FLIP = next(m for m in MUTANTS if m.path == "stats/welch.py" and "c.mean() - t" in m.new)
#: Edits a docstring only, so no golden case can see it.
HARMLESS = Mutant(
    "docstring-only",
    "stats/welch.py",
    '"""Welch\'s t-test for a difference in means with unequal variances."""',
    '"""Welch t-test."""',
    "changes nothing a test can see",
)
#: Imports a module that does not exist: the gate never gets to run.
BROKEN = Mutant(
    "import-error",
    "stats/welch.py",
    "from scipy import stats",
    "from scipy import no_such_module_abkit",
    "breaks import",
)


def test_gate_subset_is_ci_fast() -> None:
    assert GATE_SUBSET == "ci-fast"


def test_clean_engine_passes_on_the_tiny_dataset(tmp_path: Path) -> None:
    run = check_package(None, _tiny_root(tmp_path), subset=None)
    assert run.mutant is None
    assert run.outcome is RunOutcome.PASS
    assert run.exit_code == 0
    assert run.failing == ()
    assert run.summary.startswith("summary: 1 pass, 0 fail")


def test_a_real_mutant_fails_the_tiny_dataset(tmp_path: Path) -> None:
    run = check_package(SIGN_FLIP, _tiny_root(tmp_path), subset=None)
    assert run.mutant == SIGN_FLIP.id
    assert run.outcome is RunOutcome.FAIL
    assert run.exit_code == 1
    assert run.failing == ("welch/tiny",)


def test_a_mutant_that_breaks_import_is_broken_not_blocked(tmp_path: Path) -> None:
    run = check_package(BROKEN, _tiny_root(tmp_path), subset=None)
    assert run.outcome is RunOutcome.BROKEN
    assert "no_such_module_abkit" in run.summary


def test_report_counts_blocked_survived_and_broken(tmp_path: Path) -> None:
    report = run_gate(_tiny_root(tmp_path), subset=None, mutants=(SIGN_FLIP, HARMLESS, BROKEN))
    assert report.clean.outcome is RunOutcome.PASS
    assert report.blocked == (SIGN_FLIP.id,)
    assert report.survived == (HARMLESS.id,)
    assert report.broken == (BROKEN.id,)
    assert not report.ok
    assert report.harness_error
    text = report.format()
    assert f"BLOCKED  {SIGN_FLIP.id}" in text
    assert f"SURVIVED {HARMLESS.id}" in text
    assert f"BROKEN   {BROKEN.id}" in text
    assert "mutants: 1/3 blocked, 1 survived, 1 broken" in text


def test_a_survivor_alone_fails_the_gate_without_a_harness_error(tmp_path: Path) -> None:
    report = run_gate(_tiny_root(tmp_path), subset=None, mutants=(SIGN_FLIP, HARMLESS))
    assert not report.ok
    assert not report.harness_error


def test_a_failing_clean_engine_is_a_harness_error(tmp_path: Path) -> None:
    report = run_gate(_tiny_root(tmp_path, p_value=0.5), subset=None, mutants=(SIGN_FLIP,))
    assert report.clean.outcome is RunOutcome.FAIL
    assert not report.ok
    assert report.harness_error


def test_no_mutants_is_not_a_passing_gate(tmp_path: Path) -> None:
    report = run_gate(_tiny_root(tmp_path), subset=None, mutants=())
    assert not report.ok


@pytest.fixture(scope="module")
def ci_fast_report() -> GateReport:
    return run_gate(GOLDEN_LATEST, subset=GATE_SUBSET)


def test_clean_engine_passes_the_committed_ci_fast_gate(ci_fast_report: GateReport) -> None:
    assert ci_fast_report.clean.outcome is RunOutcome.PASS
    assert ci_fast_report.clean.summary.endswith("0 missing, 0 error (29 cases)")


def test_every_committed_mutant_is_blocked_by_the_ci_fast_gate(
    ci_fast_report: GateReport,
) -> None:
    assert ci_fast_report.blocked == tuple(m.id for m in MUTANTS)
    assert ci_fast_report.ok
    assert all(run.failing for run in ci_fast_report.mutants)
