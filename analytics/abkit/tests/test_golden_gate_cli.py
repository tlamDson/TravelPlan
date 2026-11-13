"""``abkit gate``: exit codes, subset selection and the M10 rows of runs.csv."""

from pathlib import Path

import pytest
from conftest import GOLDEN_LATEST

import abkit.cli as cli
from abkit.golden.gate import GateReport, PackageRun, RunOutcome, m10_records
from abkit.runs import read_runs

PASS = PackageRun(None, RunOutcome.PASS, 0, (), "summary: 29 pass, 0 fail")


def _report(*outcomes: RunOutcome, clean: PackageRun = PASS, subset="ci-fast") -> GateReport:
    runs = tuple(
        PackageRun(f"m{i}", o, 1 if o is RunOutcome.FAIL else 0, ("welch/x",), "summary: …")
        for i, o in enumerate(outcomes)
    )
    return GateReport(GOLDEN_LATEST, subset, clean, runs)


class FakeGate:
    """Stands in for ``run_gate``: records each call and returns ``report``."""

    def __init__(self) -> None:
        self.report = _report(RunOutcome.FAIL, RunOutcome.FAIL)
        self.calls: list[dict] = []

    def __call__(self, root, subset) -> GateReport:
        self.calls.append({"root": Path(root), "subset": subset})
        return self.report


@pytest.fixture
def gate(monkeypatch) -> FakeGate:
    fake = FakeGate()
    monkeypatch.setattr(cli, "run_gate", fake)
    return fake


def test_gate_defaults_to_ci_fast_on_the_latest_dataset(gate, capsys) -> None:
    assert cli.main(["gate"]) == 0
    assert gate.calls == [{"root": GOLDEN_LATEST, "subset": "ci-fast"}]
    assert "mutants: 2/2 blocked" in capsys.readouterr().out


def test_gate_full_runs_every_case(gate) -> None:
    assert cli.main(["gate", str(GOLDEN_LATEST), "--full"]) == 0
    assert gate.calls[0]["subset"] is None


def test_gate_exits_one_when_a_mutant_survives(gate) -> None:
    gate.report = _report(RunOutcome.FAIL, RunOutcome.PASS)
    assert cli.main(["gate"]) == 1


@pytest.mark.parametrize(
    "report",
    [
        _report(RunOutcome.FAIL, RunOutcome.BROKEN),
        _report(RunOutcome.FAIL, clean=PackageRun(None, RunOutcome.FAIL, 1, ("a/b",), "s")),
    ],
)
def test_gate_exits_two_on_a_harness_error(gate, report: GateReport) -> None:
    gate.report = report
    assert cli.main(["gate"]) == 2


def test_gate_record_appends_the_m10_rows(gate, tmp_path: Path) -> None:
    runs = tmp_path / "runs.csv"
    assert cli.main(["gate", "--record", "--pr", "15a", "--runs-csv", str(runs)]) == 0
    assert [r.metric for r in read_runs(runs)] == [
        "golden_gate_mutants_blocked",
        "golden_pass_share",
        "golden_pass_share_simulated",
    ]


def test_gate_without_record_writes_nothing(gate, tmp_path: Path) -> None:
    runs = tmp_path / "runs.csv"
    assert cli.main(["gate", "--runs-csv", str(runs)]) == 0
    assert not runs.exists()


def test_m10_records_count_mutants_and_split_real_from_simulated_cases() -> None:
    report = _report(RunOutcome.FAIL, RunOutcome.FAIL, RunOutcome.PASS)
    blocked, real, simulated = m10_records(
        report, pr="15a", git_sha="abc", run_at="2026-11-13T00:00:00+00:00"
    )

    assert (blocked.metric_id, blocked.value, blocked.unit, blocked.n) == ("M10", 2.0, "mutants", 3)
    assert blocked.simulated is False
    assert "subset=ci-fast" in blocked.notes and "survived=m2" in blocked.notes
    assert "baseline_without_gate=0/3" in blocked.notes

    # Full v2 run of the installed engine: 28 G-ref + G-public cases, 50 SIMULATED G-sim cases.
    assert (real.metric_id, real.value, real.unit, real.n, real.simulated) == (
        "M10",
        1.0,
        "share",
        28,
        False,
    )
    assert (simulated.value, simulated.n, simulated.simulated) == (1.0, 50, True)
    assert "simulated" in simulated.notes
    assert {r.pr for r in (blocked, real, simulated)} == {"15a"}
    assert {r.git_sha for r in (blocked, real, simulated)} == {"abc"}
