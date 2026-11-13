"""Daily metric series from TravelPlan events (simkit ``events.jsonl`` or the daily export).

Both sources share the catalog envelope; only ``userId``, ``occurredAt`` and ``name`` are read.
Days are UTC calendar days. Every day between the first and the last event is in the series,
with 0 when no identified user was active, so a gap in the log never shortens the series.
"""

from __future__ import annotations

import gzip
import json
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import numpy as np

#: A "contributor" is a user who creates or changes a trip that day.
CONTRIBUTOR_EVENTS = frozenset({"trip_generation_requested", "itinerary_edited", "trip_saved"})


@dataclass(frozen=True)
class DailySeries:
    name: str
    start: date
    values: np.ndarray  # float, one value per day from ``start``

    @property
    def dates(self) -> list[date]:
        return [self.start + timedelta(days=i) for i in range(len(self.values))]


def _read_jsonl(path: Path) -> list[dict]:
    opener: Callable = gzip.open if path.name.endswith(".gz") else open
    events = []
    with opener(path, "rt", encoding="utf-8") as fh:
        for number, line in enumerate(fh, start=1):
            if not line.strip():
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError as err:
                raise ValueError(f"{path}: line {number}: {err.msg}") from err
    return events


def read_events(path: Path) -> list[dict]:
    """Events of one ``.jsonl``/``.jsonl.gz`` file, or of every such file in a directory."""
    path = Path(path)
    if not path.is_dir():
        return _read_jsonl(path)
    files = sorted(
        p for p in path.iterdir() if p.name.endswith(".jsonl") or p.name.endswith(".jsonl.gz")
    )
    return [event for f in files for event in _read_jsonl(f)]


def _utc_day(occurred_at: str) -> date:
    try:
        parsed = datetime.fromisoformat(occurred_at)
    except (TypeError, ValueError) as err:
        raise ValueError(f"occurredAt is not ISO 8601: {occurred_at!r}") from err
    if parsed.tzinfo is None:
        raise ValueError(f"occurredAt needs a timezone: {occurred_at!r}")
    return parsed.astimezone(UTC).date()


def daily_users(
    events: Iterable[dict], name: str, counted: frozenset[str] | None = None
) -> DailySeries:
    """Distinct users per UTC day, over the days spanned by all identified events.

    ``counted`` limits which event names make a user count that day (None: any event).
    """
    days: list[date] = []
    users: dict[date, set[str]] = {}
    for event in events:
        user = event.get("userId")
        if user is None:
            continue
        day = _utc_day(event["occurredAt"])
        days.append(day)
        if counted is None or event.get("name") in counted:
            users.setdefault(day, set()).add(user)
    if not days:
        raise ValueError("no event with a userId: cannot build a daily series")
    start, end = min(days), max(days)
    values = np.zeros((end - start).days + 1)
    for day, ids in users.items():
        values[(day - start).days] = len(ids)
    return DailySeries(name=name, start=start, values=values)


def daily_active_users(events: Iterable[dict]) -> DailySeries:
    return daily_users(events, "dau")


def daily_contributors(events: Iterable[dict]) -> DailySeries:
    return daily_users(events, "contributors", CONTRIBUTOR_EVENTS)
