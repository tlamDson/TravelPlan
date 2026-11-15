"""The driver's daily-export step: one ``analytics:export`` per UTC day, then read the files."""

import gzip
import json

import pytest

from simkit.driver import daily_export
from simkit.driver.daily_export import export_run

ENV = {"MONGO_URI": "mongodb://localhost/travelplan_sim", "ANALYTICS_HASH_SECRET": "k" * 40}


def _event(event_id: str, occurred_at: str) -> dict:
    return {"eventId": event_id, "occurredAt": occurred_at}


EVENTS = [
    _event("a", "2026-11-01T08:00:00.000Z"),
    _event("b", "2026-11-01T23:59:59.000Z"),
    _event("c", "2026-11-03T00:00:00.000Z"),  # nothing on 11-02: still exported (empty file)
]


def _write(out_dir, day, ids):
    out_dir.mkdir(parents=True, exist_ok=True)
    with gzip.open(out_dir / f"events-{day}.jsonl.gz", "wt", encoding="utf-8") as f:
        f.writelines(json.dumps({"eventId": i}) + "\n" for i in ids)


@pytest.fixture
def calls(monkeypatch):
    """Stands in for ``npm run analytics:export``: writes the day's ids, records the call."""
    made = []

    def fake_export_day(day, out_dir, env):
        made.append((day, out_dir, env))
        _write(out_dir, day, [e["eventId"] for e in EVENTS if e["occurredAt"][:10] == day])

    monkeypatch.setattr(daily_export, "export_day", fake_export_day)
    return made


def test_exports_every_utc_day_of_the_run_once_and_in_order(tmp_path, calls):
    out = tmp_path / "export"
    export_run(EVENTS, out, ENV)
    assert [day for day, _, _ in calls] == ["2026-11-01", "2026-11-02", "2026-11-03"]
    assert all(out_dir == out for _, out_dir, _ in calls)


def test_every_day_is_exported_with_the_backend_env(tmp_path, calls):
    # Same MONGO_URI and ANALYTICS_HASH_SECRET as the ingest, or the hashed ids would not join.
    export_run(EVENTS, tmp_path / "export", ENV)
    assert all(env is ENV for _, _, env in calls)


def test_returns_the_rows_of_every_exported_day(tmp_path, calls):
    rows = export_run(EVENTS, tmp_path / "export", ENV)
    assert [r["eventId"] for r in rows] == ["a", "b", "c"]


def test_no_accepted_events_means_no_export_and_no_rows(tmp_path, calls):
    assert export_run([], tmp_path / "export", ENV) == []
    assert calls == []


def test_day_files_left_by_an_earlier_run_in_the_same_dir_are_not_read(tmp_path, calls):
    out = tmp_path / "export"
    _write(out, "2026-10-31", ["stale-before"])
    _write(out, "2026-11-09", ["stale-after"])
    rows = export_run(EVENTS, out, ENV)
    assert [r["eventId"] for r in rows] == ["a", "b", "c"]
    assert sorted(p.name for p in out.iterdir()) == [
        "events-2026-11-01.jsonl.gz",
        "events-2026-11-02.jsonl.gz",
        "events-2026-11-03.jsonl.gz",
    ]


def test_a_day_the_export_did_not_write_fails_the_run(tmp_path, monkeypatch):
    def skips_the_second(day, out_dir, env):
        if day != "2026-11-02":
            _write(out_dir, day, [])

    monkeypatch.setattr(daily_export, "export_day", skips_the_second)
    with pytest.raises(RuntimeError, match="2026-11-02"):
        export_run(EVENTS, tmp_path / "export", ENV)


def test_a_failing_export_command_stops_the_run(tmp_path, monkeypatch):
    def fails(day, out_dir, env):
        raise OSError("npm not found")

    monkeypatch.setattr(daily_export, "export_day", fails)
    with pytest.raises(OSError, match="npm not found"):
        export_run(EVENTS, tmp_path / "export", ENV)
