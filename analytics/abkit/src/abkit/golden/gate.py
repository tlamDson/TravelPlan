"""The golden gate (B2 plan, PR 15a, M10): the engine passes, every planted mutant is blocked.

Each run copies the ``abkit`` package to a temporary directory (clean, or with one mutant
from ``abkit.golden.mutants``) and runs ``abkit golden ROOT --strict [--subset S]`` from that
copy in a fresh interpreter, exactly what the CI step runs. A mutant is *blocked* when that
run exits 1 with a report, *survived* when it exits 0, and *broken* when no report comes
back (it crashed before checking anything, so it proves nothing). The gate holds when the
clean copy passes and every mutant is blocked.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from abkit.golden.mutants import MUTANTS, PACKAGE_DIR, Mutant, write_package
from abkit.golden.runner import Status, run_golden
from abkit.runs import RunRecord

GATE_SUBSET = "ci-fast"
#: Group prefix of the SIMULATED G-sim cases (``analytics/golden/README.md``).
SIM_PREFIX = "sim-"

#: Runs in the child: import abkit from the copy (argv[1]) or refuse, then the golden CLI.
_BOOT = (
    "import pathlib, sys\n"
    "sys.path.insert(0, sys.argv[1])\n"
    "import abkit\n"
    "if not pathlib.Path(abkit.__file__).resolve().is_relative_to("
    "pathlib.Path(sys.argv[1]).resolve()):\n"
    "    sys.exit('abkit imported from ' + abkit.__file__ + ', not from the copy')\n"
    "from abkit.cli import main\n"
    "raise SystemExit(main(sys.argv[2:]))\n"
)


class RunOutcome(Enum):
    PASS = "pass"  # exit 0: every case passed
    FAIL = "fail"  # exit 1 with a report: some case failed or errored
    BROKEN = "broken"  # no report: the copy crashed, timed out, or the dataset is malformed


@dataclass(frozen=True)
class PackageRun:
    mutant: str | None
    outcome: RunOutcome
    exit_code: int
    failing: tuple[str, ...]  # ids of the FAIL / ERROR cases
    summary: str  # the report's summary line, or why there is none


def check_package(
    mutant: Mutant | None,
    root: Path,
    subset: str | None = GATE_SUBSET,
    package_dir: Path = PACKAGE_DIR,
    timeout: float = 600,
) -> PackageRun:
    """Run the golden check on a copy of ``package_dir`` patched with ``mutant``."""
    args = ["golden", str(Path(root).resolve()), "--strict"]
    if subset is not None:
        args += ["--subset", subset]
    name = None if mutant is None else mutant.id
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    with tempfile.TemporaryDirectory(prefix="abkit-gate-") as tmp:
        write_package(Path(tmp), mutant, package_dir)
        cmd = [sys.executable, "-c", _BOOT, tmp, *args]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
        except subprocess.TimeoutExpired:
            return PackageRun(name, RunOutcome.BROKEN, -1, (), f"timed out after {timeout}s")
    lines = proc.stdout.splitlines()
    summary = next((line for line in reversed(lines) if line.startswith("summary:")), None)
    if summary is None or proc.returncode not in (0, 1):
        tail = (proc.stderr.strip().splitlines() or ["no output"])[-1]
        return PackageRun(name, RunOutcome.BROKEN, proc.returncode, (), tail)
    failing = tuple(
        line.split()[1] for line in lines if line.startswith((Status.FAIL.name, Status.ERROR.name))
    )
    outcome = RunOutcome.PASS if proc.returncode == 0 else RunOutcome.FAIL
    return PackageRun(name, outcome, proc.returncode, failing, summary)


@dataclass(frozen=True)
class GateReport:
    root: Path
    subset: str | None
    clean: PackageRun
    mutants: tuple[PackageRun, ...]

    def _ids(self, outcome: RunOutcome) -> tuple[str, ...]:
        return tuple(r.mutant for r in self.mutants if r.outcome is outcome)

    @property
    def blocked(self) -> tuple[str, ...]:
        return self._ids(RunOutcome.FAIL)

    @property
    def survived(self) -> tuple[str, ...]:
        return self._ids(RunOutcome.PASS)

    @property
    def broken(self) -> tuple[str, ...]:
        return self._ids(RunOutcome.BROKEN)

    @property
    def harness_error(self) -> bool:
        """The gate could not judge: the clean engine does not pass, or a mutant crashed."""
        return self.clean.outcome is not RunOutcome.PASS or bool(self.broken)

    @property
    def ok(self) -> bool:
        return (
            not self.harness_error and bool(self.mutants) and len(self.blocked) == len(self.mutants)
        )

    def format(self) -> str:
        scope = self.subset or "full"
        lines = [f"abkit gate: {self.root} (subset {scope})"]
        lines.append(f"clean    {self.clean.outcome.name:<8} {self.clean.summary}")
        label = {
            RunOutcome.FAIL: "BLOCKED",
            RunOutcome.PASS: "SURVIVED",
            RunOutcome.BROKEN: "BROKEN",
        }
        for r in self.mutants:
            detail = f"caught by {', '.join(r.failing)}" if r.failing else r.summary
            lines.append(f"{label[r.outcome]:<8} {r.mutant}  ({detail})")
        lines.append(
            f"mutants: {len(self.blocked)}/{len(self.mutants)} blocked, "
            f"{len(self.survived)} survived, {len(self.broken)} broken"
        )
        return "\n".join(lines)


def run_gate(
    root: Path,
    subset: str | None = GATE_SUBSET,
    mutants: Sequence[Mutant] | None = None,
    package_dir: Path = PACKAGE_DIR,
    workers: int | None = None,
) -> GateReport:
    """The clean run plus one run per mutant (``MUTANTS`` by default), in parallel."""
    chosen = tuple(MUTANTS if mutants is None else mutants)
    jobs = (None, *chosen)
    workers = workers or min(4, os.cpu_count() or 1)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        runs = list(pool.map(lambda m: check_package(m, root, subset, package_dir), jobs))
    return GateReport(Path(root), subset, runs[0], tuple(runs[1:]))


def m10_records(report: GateReport, pr: str, git_sha: str, run_at: str) -> list[RunRecord]:
    """M10 rows: mutants blocked by the gate, and the full dataset's pass share.

    The pass share runs the installed engine on every case of ``report.root``; the SIMULATED
    G-sim cases (virtual users) are counted in their own row.
    """
    golden = run_golden(report.root)
    scope = report.subset or "full"

    def row(metric: str, value: float, unit: str, n: int, simulated: bool, notes: str):
        return RunRecord(run_at, git_sha, pr, "M10", metric, value, unit, n, "", simulated, notes)

    total = len(report.mutants)
    rows = [
        row(
            "golden_gate_mutants_blocked",
            float(len(report.blocked)),
            "mutants",
            total,
            False,
            f"gate=abkit golden --strict subset={scope} root={report.root.name} "
            f"blocked={','.join(report.blocked) or '-'} "
            f"survived={','.join(report.survived) or '-'} "
            f"broken={','.join(report.broken) or '-'} baseline_without_gate=0/{total}",
        )
    ]
    for simulated, metric in ((False, "golden_pass_share"), (True, "golden_pass_share_simulated")):
        part = [r for r in golden.results if r.case_id.startswith(SIM_PREFIX) is simulated]
        if not part:
            continue
        passed = sum(r.status is Status.PASS for r in part)
        what = "simulated G-sim cases (virtual users)" if simulated else "G-ref + G-public cases"
        notes = f"{what} root={report.root.name} full dataset pass={passed}/{len(part)}"
        rows.append(row(metric, passed / len(part), "share", len(part), simulated, notes))
    return rows
