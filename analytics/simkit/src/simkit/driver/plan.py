"""Split SIMULATED events into one script per virtual user, in batches the ingest accepts.

A Locust user takes one script at a time and posts its batches in order, so every event of a
virtual user (and a duplicate placed after its original) reaches the server in stream order.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from simkit.catalog import SCHEMA_PATH

BATCH_SCHEMA_PATH = SCHEMA_PATH.with_name("analytics-event-batch.schema.json")
#: ``ANALYTICS_BATCH_MAX_EVENTS`` of the shared catalog, read from its JSON Schema export.
BATCH_MAX_EVENTS: int = json.loads(BATCH_SCHEMA_PATH.read_text(encoding="utf-8"))["properties"][
    "events"
]["maxItems"]
UNKEYED = "unkeyed"


@dataclass(frozen=True)
class UserScript:
    key: str  # the userId, else the sessionId, else "unkeyed" (faulted events)
    batches: tuple[tuple[object, ...], ...]

    @property
    def n_events(self) -> int:
        return sum(len(b) for b in self.batches)


def _key(event: object) -> str:
    if isinstance(event, dict):
        for field in ("userId", "sessionId"):
            value = event.get(field)
            if isinstance(value, str) and value:
                return value
    return UNKEYED


def build_plan(events: Sequence[object], batch_size: int = BATCH_MAX_EVENTS) -> list[UserScript]:
    """One script per key, in first-seen order; each key's events in stream order."""
    if isinstance(batch_size, bool) or not 1 <= batch_size <= BATCH_MAX_EVENTS:
        raise ValueError(f"batch_size must be in [1, {BATCH_MAX_EVENTS}], got {batch_size!r}")
    grouped: dict[str, list[object]] = {}
    for event in events:
        grouped.setdefault(_key(event), []).append(event)
    return [
        UserScript(
            key,
            tuple(tuple(mine[i : i + batch_size]) for i in range(0, len(mine), batch_size)),
        )
        for key, mine in grouped.items()
    ]


def write_plan(scripts: Sequence[UserScript], path: str | Path) -> None:
    payload = {
        "simulated": True,
        "scripts": [{"key": s.key, "batches": [list(b) for b in s.batches]} for s in scripts],
    }
    Path(path).write_text(json.dumps(payload), encoding="utf-8")


def read_plan(path: str | Path) -> list[UserScript]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if payload.get("simulated") is not True:
        raise ValueError(f"{path}: not a plan of simulated events")
    return [UserScript(s["key"], tuple(tuple(b) for b in s["batches"])) for s in payload["scripts"]]
