"""The user table a readout gets, built from events: the simulated stream or the export.

Same rule as the G-sim ``saves`` metric (``simkit.golden_truth``): a user is enrolled at their
first ``experiment_exposure`` of the experiment, if a full window fits before the run ends, and
is measured on the ``trip_saved`` events in ``[first exposure, + window_days)``. Only fields the
export keeps are read (``name``, ``userId``, ``occurredAt``, the exposure's ``experimentKey``
and ``variant``), so the table does not depend on whether ids are raw or hashed.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime, timedelta
from typing import Any

from simkit._common import parse_ts

EXPOSURE = "experiment_exposure"
TARGET = "trip_saved"
ALPHA = 0.05


def enrollment_table(
    events: Iterable[Mapping[str, Any]],
    experiment_key: str,
    *,
    start: date,
    days: int,
    window_days: int,
    target: str = TARGET,
) -> dict[str, list]:
    """Columns ``variant`` and ``saves``: one row per enrolled user."""
    if not 0 < window_days < days:
        raise ValueError(f"window_days must be in (0, days={days}), got {window_days!r}")
    first: dict[str, tuple[datetime, str]] = {}
    hits: dict[str, list[datetime]] = {}
    for event in events:
        user = event.get("userId")
        if not isinstance(user, str):
            continue
        at = parse_ts(event["occurredAt"])
        props = event.get("properties") or {}
        if event["name"] == EXPOSURE and props.get("experimentKey") == experiment_key:
            if user not in first or at < first[user][0]:
                first[user] = (at, props["variant"])
        elif event["name"] == target:
            hits.setdefault(user, []).append(at)

    origin = datetime(start.year, start.month, start.day, tzinfo=UTC)
    last_day = days - window_days
    window = timedelta(days=window_days)
    columns: dict[str, list] = {"variant": [], "saves": []}
    for user, (at, variant) in sorted(first.items()):
        if (at - origin) // timedelta(days=1) >= last_day:
            continue
        columns["variant"].append(variant)
        columns["saves"].append(sum(at <= t < at + window for t in hits.get(user, ())))
    return columns


def readout_params(definition: Mapping[str, Any]) -> dict[str, Any]:
    """abkit readout params: mean saves per user, planned shares from the variant weights."""
    weights = {v["key"]: v["weight"] for v in definition["variants"]}
    arms = {k: weights[k] for k in ("control", "treatment")}
    total = sum(arms.values())
    return {
        "alpha": ALPHA,
        "expected_shares": {k: w / total for k, w in arms.items()},
        "metric": {"kind": "mean", "column": "saves"},
    }
