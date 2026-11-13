"""B2 plan, PR 23 (optional): R's testthat suite re-checks the G-ref golden answers.

R is not installed in CI, so this test skips there; locally it runs
``analytics/abkit/r/run.R`` and needs the testthat and jsonlite packages.
"""

from __future__ import annotations

import glob
import os
import shutil
import subprocess
from pathlib import Path

import pytest

R_DIR = Path(__file__).resolve().parents[1] / "r"


def find_rscript() -> str | None:
    """``ABKIT_RSCRIPT``, then ``Rscript`` on PATH, then the default Windows install."""
    env = os.environ.get("ABKIT_RSCRIPT")
    if env:
        return env
    on_path = shutil.which("Rscript")
    if on_path:
        return on_path
    installed = sorted(glob.glob("C:/Program Files/R/R-*/bin/Rscript.exe"))
    return installed[-1] if installed else None


RSCRIPT = find_rscript()


@pytest.mark.skipif(RSCRIPT is None, reason="R (Rscript) is not installed on this machine")
def test_r_testthat_suite_agrees_with_golden_to_1e_8() -> None:
    # Rscript segfaults on a missing script, so check the entry point first.
    assert (R_DIR / "run.R").is_file(), "analytics/abkit/r/run.R is missing"
    result = subprocess.run(
        [RSCRIPT, str(R_DIR / "run.R")],
        cwd=R_DIR,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "FAIL 0" in result.stdout
