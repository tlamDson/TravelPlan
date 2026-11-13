"""The committed GitHub Actions panel (PR 18) as a ``DidPanel`` (B2 plan, PR 19).

A row is a repository and period with at least one merged non-bot PR created in it; months
without one have no merge time and are left out (an unbalanced panel). Periods are blocks
of ``period_months`` months counted from the first month of the panel (calendar quarters
for 3, as the panel starts in January). The outcome is ``mean_log1p`` (the mean over the
period's PRs of ``log1p`` hours to merge; a quarter pools its months weighted by their PR
counts, which is exactly the mean over its PRs) or ``log1p_median`` (``log1p`` of the
month's median hours, monthly only: medians do not pool). ``weighted`` weights a row by its
merged PRs. The cohort is the period holding the adoption month; repositories adopting
after the window are late adopters (``controls="never"`` drops them).
"""

from __future__ import annotations

import csv
import math
from collections import defaultdict
from pathlib import Path

from abkit.actions.cli import ACTIONS_PANEL_DIR
from abkit.actions.panel import month_diff
from abkit.did.panel import CONTROLS, NEVER, DidPanel

ACTIONS_PANEL_CSV = ACTIONS_PANEL_DIR / "panel.csv"
OUTCOMES = ("mean_log1p", "log1p_median")


def _check(outcome: str, period_months: int, controls: str) -> None:
    if outcome not in OUTCOMES:
        raise ValueError(f"outcome must be one of {OUTCOMES}, got {outcome!r}")
    if not isinstance(period_months, int) or period_months < 1:
        raise ValueError(f"period_months must be a positive integer, got {period_months!r}")
    if outcome == "log1p_median" and period_months != 1:
        raise ValueError("the log1p_median outcome is monthly only: medians do not pool")
    if controls not in CONTROLS:
        raise ValueError(f"controls must be one of {CONTROLS}, got {controls!r}")


def _read(path: Path) -> list[dict[str, str]]:
    with Path(path).open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def load_actions_panel(
    path: Path = ACTIONS_PANEL_CSV,
    *,
    outcome: str = "mean_log1p",
    period_months: int = 3,
    controls: str = "never_and_late",
    weighted: bool = False,
) -> DidPanel:
    _check(outcome, period_months, controls)
    rows = _read(path)
    start = min(r["month"] for r in rows)
    end = max(r["month"] for r in rows)
    sums: dict[tuple[str, int], list[float]] = defaultdict(lambda: [0.0, 0.0])
    cohorts: dict[str, int] = {}
    for r in rows:
        n = int(r["n_merged"])
        if n == 0:
            continue
        adoption = r["adoption_month"]
        if controls == "never" and adoption and adoption > end:
            continue
        period = month_diff(r["month"], start) // period_months
        cohorts[r["repo"]] = month_diff(adoption, start) // period_months if adoption else NEVER
        if outcome == "mean_log1p":
            value = float(r["mean_log1p_merge_hours"])
        else:
            value = math.log1p(float(r["median_merge_hours"]))
        cell = sums[(r["repo"], period)]
        cell[0] += n * value
        cell[1] += n
    keys = sorted(sums)
    return DidPanel.from_arrays(
        unit=[repo for repo, _ in keys],
        time=[period for _, period in keys],
        y=[sums[k][0] / sums[k][1] for k in keys],
        cohort=[cohorts[repo] for repo, _ in keys],
        weight=[sums[k][1] for k in keys] if weighted else None,
    )
