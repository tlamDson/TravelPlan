"""Timestamps and seeded ids shared by the generator and the fault injector."""

from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime, timedelta


def fmt_ts(moment: datetime) -> str:
    """ISO 8601 in UTC with millisecond precision, e.g. ``2026-11-01T08:15:03.120Z``."""
    moment = moment.astimezone(UTC)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def ms(milliseconds: float) -> timedelta:
    return timedelta(milliseconds=milliseconds)


def new_event_id(rng: random.Random, used: set[str]) -> str:
    """UUID v4 drawn from ``rng`` (reproducible), never repeating one in ``used``."""
    while True:
        event_id = str(uuid.UUID(int=rng.getrandbits(128), version=4))
        if event_id not in used:
            used.add(event_id)
            return event_id


def check_int(name: str, value: object, minimum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}, got {value!r}")
    return value
