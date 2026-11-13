"""The Python replay of the ingest rules must reproduce the hand-counted G-event answer key."""

import copy
import json
from pathlib import Path

import pytest

from simkit.catalog import (
    QUARANTINE_REASONS,
    SCHEMA_PATH,
    load_catalog,
    replay_ingest,
)

VALID = {
    "eventId": "0b7c6f0e-0000-4000-8000-000000000001",
    "schemaVersion": 1,
    "occurredAt": "2026-11-01T09:00:00.000Z",
    "sessionId": "sess-1",
    "userId": "user-1",
    "source": "web",
    "name": "trip_viewed",
    "properties": {"tripId": "trip-1"},
}


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_schema_path_points_at_the_exported_catalog(repo_root: Path) -> None:
    assert repo_root / "packages/shared/json-schema/analytics-event.schema.json" == SCHEMA_PATH


def test_catalog_knows_the_eight_event_names() -> None:
    assert load_catalog().names == (
        "wizard_started",
        "trip_generation_requested",
        "trip_generation_completed",
        "trip_viewed",
        "itinerary_edited",
        "trip_saved",
        "calendar_synced",
        "experiment_exposure",
    )


def test_reasons_keep_the_backend_priority_order() -> None:
    # backend/src/features/analytics/services/quarantine-reason.ts, minus the
    # HTTP-only policy reason user_mismatch.
    assert QUARANTINE_REASONS == (
        "unknown_event",
        "wrong_source",
        "missing_field",
        "unknown_field",
        "wrong_type",
    )


def test_replay_reproduces_the_golden_ingest_batch(golden_events: Path) -> None:
    events = _load(golden_events / "ingest-batch/input.json")["events"]
    truth = _load(golden_events / "ingest-batch/truth.json")

    replay = replay_ingest(events)

    assert replay.counts() == truth["expected"]
    for case in truth["cases"]:
        outcome = replay.outcomes[case["index"]]
        assert outcome.outcome == case["outcome"], case
        assert outcome.reason == case.get("reason"), case
        assert outcome.issue_path == case.get("issuePath"), case


def test_every_event_of_the_golden_dau_log_is_accepted(golden_events: Path) -> None:
    events = _load(golden_events / "dau-funnel/events.json")["events"]
    replay = replay_ingest(events)
    assert replay.counts() == {
        "received": len(events),
        "accepted": len(events),
        "duplicates": 0,
        "quarantined": 0,
    }


def test_valid_event_has_no_violation() -> None:
    assert load_catalog().classify(VALID) is None


def test_anonymous_event_is_valid() -> None:
    assert load_catalog().classify({**VALID, "userId": None}) is None


@pytest.mark.parametrize(
    ("mutate", "reason", "path"),
    [
        (lambda e: e.pop("source"), "wrong_source", "source"),
        (lambda e: e.update(source="desktop"), "wrong_source", "source"),
        (lambda e: e.pop("userId"), "missing_field", "userId"),
        (lambda e: e.pop("properties"), "missing_field", "properties"),
        (lambda e: e.update(userId=None, sessionId=None), "wrong_type", "sessionId"),
        (lambda e: e.update(schemaVersion="1"), "wrong_type", "schemaVersion"),
        (lambda e: e["properties"].update(utmSource="ads"), "unknown_field", "properties"),
        (lambda e: e.update(referrer="x"), "unknown_field", ""),
        (lambda e: e.pop("name"), "unknown_event", "name"),
        (lambda e: e.update(name=7), "unknown_event", "name"),
        (lambda e: e.update(occurredAt="2026-11-01 09:00"), "wrong_type", "occurredAt"),
    ],
)
def test_classify_labels_like_the_backend(mutate, reason: str, path: str) -> None:
    event = copy.deepcopy(VALID)
    mutate(event)
    violation = load_catalog().classify(event)
    assert violation is not None
    assert violation.reason == reason
    assert violation.issue_path == path


def test_missing_field_outranks_wrong_type() -> None:
    event = copy.deepcopy(VALID)
    del event["sessionId"]
    event["schemaVersion"] = 2
    assert load_catalog().classify(event).reason == "missing_field"


def test_non_object_event_is_wrong_type() -> None:
    violation = load_catalog().classify(["not", "an", "event"])
    assert violation.reason == "wrong_type"
    assert violation.issue_path == ""


def test_quarantined_event_is_never_deduplicated() -> None:
    bad = {**VALID, "schemaVersion": 2}
    replay = replay_ingest([bad, bad, VALID, VALID])
    assert [o.outcome for o in replay.outcomes] == [
        "quarantined",
        "quarantined",
        "accepted",
        "duplicate",
    ]
    assert replay.counts() == {"received": 4, "accepted": 1, "duplicates": 1, "quarantined": 2}
