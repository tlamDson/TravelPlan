import gzip
import json
from datetime import date
from pathlib import Path

import numpy as np
import pytest

from abkit.forecast.series import (
    CONTRIBUTOR_EVENTS,
    daily_active_users,
    daily_contributors,
    read_events,
)


def _event(user: str | None, at: str, name: str = "trip_viewed") -> dict:
    return {"userId": user, "occurredAt": at, "name": name, "source": "web"}


EVENTS = [
    _event("u1", "2026-01-01T08:00:00.000Z", "wizard_started"),
    _event("u1", "2026-01-01T09:00:00.000Z", "trip_saved"),
    _event("u2", "2026-01-01T23:59:59.999Z", "trip_viewed"),
    _event(None, "2026-01-02T10:00:00.000Z", "wizard_started"),
    # 2026-01-03 has no event at all: it must still be a day, with 0.
    _event("u2", "2026-01-04T00:00:00.000Z", "itinerary_edited"),
    _event("u3", "2026-01-04T05:00:00+07:00", "trip_generation_requested"),  # 2026-01-03 UTC
]


def test_dau_counts_distinct_users_per_utc_day_and_fills_gaps() -> None:
    series = daily_active_users(EVENTS)
    assert series.name == "dau"
    assert series.start == date(2026, 1, 1)
    assert series.dates == [date(2026, 1, d) for d in (1, 2, 3, 4)]
    # Day 2 only has an anonymous event; day 3 is u3 (UTC conversion of +07:00).
    np.testing.assert_array_equal(series.values, [2.0, 0.0, 1.0, 1.0])


def test_contributors_count_only_contributor_events_over_the_same_days() -> None:
    assert {"trip_generation_requested", "itinerary_edited", "trip_saved"} == CONTRIBUTOR_EVENTS
    series = daily_contributors(EVENTS)
    assert series.name == "contributors"
    assert series.dates == daily_active_users(EVENTS).dates
    np.testing.assert_array_equal(series.values, [1.0, 0.0, 1.0, 1.0])


def test_series_without_any_identified_user_is_rejected() -> None:
    with pytest.raises(ValueError, match="no event with a userId"):
        daily_active_users([_event(None, "2026-01-01T00:00:00Z")])


def test_timestamp_without_timezone_is_rejected() -> None:
    with pytest.raises(ValueError, match="timezone"):
        daily_active_users([_event("u1", "2026-01-01T00:00:00")])


@pytest.mark.parametrize("suffix", [".jsonl", ".jsonl.gz"])
def test_read_events_reads_plain_and_gzipped_jsonl(tmp_path: Path, suffix: str) -> None:
    path = tmp_path / f"events{suffix}"
    text = "\n".join(json.dumps(e) for e in EVENTS) + "\n\n"
    if suffix.endswith(".gz"):
        with gzip.open(path, "wt", encoding="utf-8") as fh:
            fh.write(text)
    else:
        path.write_text(text, encoding="utf-8")
    assert read_events(path) == EVENTS


def test_read_events_names_the_bad_line(tmp_path: Path) -> None:
    path = tmp_path / "events.jsonl"
    path.write_text(json.dumps(EVENTS[0]) + "\n{not json\n", encoding="utf-8")
    with pytest.raises(ValueError, match="line 2"):
        read_events(path)


def test_read_events_accepts_a_directory_of_daily_exports(tmp_path: Path) -> None:
    for day, event in (("2026-01-02", EVENTS[2]), ("2026-01-01", EVENTS[0])):
        with gzip.open(tmp_path / f"{day}.jsonl.gz", "wt", encoding="utf-8") as fh:
            fh.write(json.dumps(event) + "\n")
    (tmp_path / "notes.txt").write_text("ignored", encoding="utf-8")
    # Files are read in name order, so the result does not depend on the file system.
    assert read_events(tmp_path) == [EVENTS[0], EVENTS[2]]
