"""The golden gate is wired into CI: required job (fast) and nightly (full), B2 plan PR 15a."""

import re

from conftest import REPO_ROOT

WORKFLOWS = REPO_ROOT / ".github/workflows"
REQUIRED_JOB = "abkit Lint + Test"


def _job_block(text: str, name: str) -> str:
    """Lines of the job whose ``name:`` is ``name``, up to the next top-level job."""
    lines = text.splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip() == f"name: {name}")
    end = next(
        (j for j in range(start + 1, len(lines)) if re.match(r"^  [A-Za-z0-9_-]+:\s*$", lines[j])),
        len(lines),
    )
    return "\n".join(lines[start:end])


def _run_lines(block: str) -> list[str]:
    return [line.split("run:", 1)[1].strip() for line in block.splitlines() if "run:" in line]


def test_required_job_runs_the_fast_golden_gate_and_the_mutants() -> None:
    job = _job_block((WORKFLOWS / "ci-pr.yml").read_text(encoding="utf-8"), REQUIRED_JOB)
    runs = _run_lines(job)
    assert "python -m abkit golden --subset ci-fast --strict" in runs  # G-ref + G-sim subset
    assert "python -m abkit gate" in runs  # 10 mutants must be blocked (M10)
    assert any("tests/test_catalog.py" in r for r in runs)  # G-event replay
    assert "|| " not in job and "continue-on-error" not in job


def test_nightly_workflow_runs_the_full_golden_dataset() -> None:
    text = (WORKFLOWS / "abkit-golden-nightly.yml").read_text(encoding="utf-8")
    assert re.search(r"^\s+schedule:\s*$", text, re.M)
    assert re.search(r"^\s+- cron: \"[^\"]+\"\s*$", text, re.M)
    assert "workflow_dispatch:" in text
    runs = _run_lines(text)
    assert "python -m abkit golden --strict" in runs
    assert "python -m abkit gate --full" in runs
    assert 'SIMKIT_GOLDEN_FULL: "1"' in text
    assert "|| " not in text and "continue-on-error" not in text
    # Not a required check: it must never borrow a required job's name.
    for required in (
        "Lint + Unit Tests",
        "Typecheck + Build",
        "Backend Docker Build",
        REQUIRED_JOB,
    ):
        assert f"name: {required}\n" not in text
