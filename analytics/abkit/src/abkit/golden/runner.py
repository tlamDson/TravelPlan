"""Run every golden case through abkit and report pass/fail by tolerance."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from abkit.golden.case import GoldenCase, load_dataset
from abkit.golden.compare import compare_outputs
from abkit.golden.methods import IMPLEMENTATIONS, Implementation


class Status(Enum):
    PASS = "pass"
    FAIL = "fail"
    MISSING = "missing"
    ERROR = "error"


@dataclass(frozen=True)
class CaseResult:
    case_id: str
    method: str
    status: Status
    details: tuple[str, ...] = ()


@dataclass(frozen=True)
class GoldenReport:
    root: Path
    results: tuple[CaseResult, ...]

    @property
    def counts(self) -> dict[Status, int]:
        return {s: sum(r.status is s for r in self.results) for s in Status}

    def ok(self, strict: bool = False) -> bool:
        """No FAIL or ERROR; with ``strict``, no MISSING implementation either."""
        counts = self.counts
        bad = counts[Status.FAIL] + counts[Status.ERROR]
        return bad == 0 and (not strict or counts[Status.MISSING] == 0)

    def format(self) -> str:
        lines = [f"abkit golden: {self.root} ({len(self.results)} cases)"]
        for r in self.results:
            lines.append(f"{r.status.name:<8} {r.case_id}  [{r.method}]")
            lines.extend(f"         - {d}" for d in r.details)
        c = self.counts
        lines.append(
            f"summary: {c[Status.PASS]} pass, {c[Status.FAIL]} fail, "
            f"{c[Status.MISSING]} missing, {c[Status.ERROR]} error ({len(self.results)} cases)"
        )
        return "\n".join(lines)


def run_case(case: GoldenCase, implementations: Mapping[str, Implementation]) -> CaseResult:
    impl = implementations.get(case.method)
    if impl is None:
        detail = f"no abkit implementation for method {case.method!r} yet"
        return CaseResult(case.id, case.method, Status.MISSING, (detail,))
    try:
        actual = impl(case.read_data(), dict(case.params))
        mismatches = compare_outputs(case, actual)
    except Exception as err:  # one broken method must not hide the others
        return CaseResult(case.id, case.method, Status.ERROR, (f"{type(err).__name__}: {err}",))
    status = Status.FAIL if mismatches else Status.PASS
    return CaseResult(case.id, case.method, status, tuple(mismatches))


def run_golden(
    root: Path, implementations: Mapping[str, Implementation] | None = None
) -> GoldenReport:
    """Load the dataset at ``root`` (raises ``GoldenFormatError``) and run each case."""
    impls = IMPLEMENTATIONS if implementations is None else implementations
    cases = load_dataset(root)
    return GoldenReport(Path(root), tuple(run_case(c, impls) for c in cases))
