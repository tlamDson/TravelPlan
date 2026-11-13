"""The repo x month panel of PR merge time around GitHub Actions adoption.

One row per repository and calendar month (``YYYY-MM``) of the window, from the later of
the window start and the repository's creation month. When the PR listing was truncated
the earliest month read may be partial, so rows start the month after it. A month counts
the PRs *created* in it that were merged (bots counted apart, in ``n_bot_merged``), with
the median and the mean of ``log1p`` of the hours from creation to merge. A repository
leaves the panel when it is missing or has no non-bot merged PR in the window.

``event_time`` is months since the adoption month (negative before it, also for repos
adopting after the window, the not-yet-treated); it is empty for a repository that never
adopted. ``treated`` is 1 from the adoption month on.
"""

from __future__ import annotations

import csv
import math
import statistics
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from typing import Any

from abkit.actions.fetch import RepoRecord

PANEL_COLUMNS: tuple[str, ...] = (
    "repo",
    "month",
    "n_merged",
    "n_bot_merged",
    "median_merge_hours",
    "mean_log1p_merge_hours",
    "adoption_month",
    "event_time",
    "treated",
)


def _parse_month(month: str) -> tuple[int, int]:
    try:
        parsed = datetime.strptime(month, "%Y-%m")
    except (TypeError, ValueError) as err:
        raise ValueError(f"not a YYYY-MM month: {month!r}") from err
    return parsed.year, parsed.month


def month_diff(later: str, earlier: str) -> int:
    (y1, m1), (y0, m0) = _parse_month(later), _parse_month(earlier)
    return (y1 - y0) * 12 + (m1 - m0)


def months_between(start: str, end: str) -> list[str]:
    year, month = _parse_month(start)
    count = month_diff(end, start) + 1
    if count < 1:
        raise ValueError(f"end month {end} is before start month {start}")
    out = []
    for _ in range(count):
        out.append(f"{year:04d}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return out


def _hours(pr: dict[str, Any]) -> float:
    created = datetime.fromisoformat(pr["created_at"].replace("Z", "+00:00"))
    merged = datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00"))
    return max((merged - created).total_seconds() / 3600.0, 0.0)


def _repo_rows(record: RepoRecord, start: str, end: str) -> list[dict[str, Any]]:
    in_window = [p for p in record.prs if start <= p["created_at"][:7] <= end and p["merged_at"]]
    if record.status != "ok" or not any(not p["bot"] for p in in_window):
        return []
    first = max(start, record.created_at[:7])
    if record.truncated and record.prs:
        earliest = min(p["created_at"][:7] for p in record.prs)
        first = max(first, _next_month(earliest))
    if first > end:
        return []
    hours: dict[str, list[float]] = defaultdict(list)
    bots: dict[str, int] = defaultdict(int)
    for p in in_window:
        if p["bot"]:
            bots[p["created_at"][:7]] += 1
        else:
            hours[p["created_at"][:7]].append(_hours(p))
    adoption = record.adoption_at[:7] if record.adoption_at else None
    rows = []
    for month in months_between(first, end):
        values = hours.get(month, [])
        event_time = month_diff(month, adoption) if adoption else None
        rows.append(
            {
                "repo": record.full_name,
                "month": month,
                "n_merged": len(values),
                "n_bot_merged": bots.get(month, 0),
                "median_merge_hours": statistics.median(values) if values else None,
                "mean_log1p_merge_hours": (
                    sum(math.log1p(h) for h in values) / len(values) if values else None
                ),
                "adoption_month": adoption,
                "event_time": event_time,
                "treated": int(event_time is not None and event_time >= 0),
            }
        )
    return rows


def _next_month(month: str) -> str:
    year, mon = _parse_month(month)
    return f"{year + 1:04d}-01" if mon == 12 else f"{year:04d}-{mon + 1:02d}"


def build_panel(records: Iterable[RepoRecord], start: str, end: str) -> list[dict[str, Any]]:
    months_between(start, end)  # validates the window
    rows: list[dict[str, Any]] = []
    for record in sorted(records, key=lambda r: r.full_name):
        rows += _repo_rows(record, start, end)
    return rows


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.6g}"
    return str(value)


def write_panel(rows: Iterable[dict[str, Any]], path: Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(PANEL_COLUMNS)
        for row in rows:
            writer.writerow([_cell(row[c]) for c in PANEL_COLUMNS])
