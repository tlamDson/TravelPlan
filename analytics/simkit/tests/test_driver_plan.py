import json
from collections import Counter
from datetime import date

import pytest

from simkit.driver.plan import BATCH_MAX_EVENTS, build_plan, read_plan, write_plan
from simkit.faults import inject_faults
from simkit.generator import simulate


@pytest.fixture(scope="module")
def faulted():
    sim = simulate(seed=7, users=30, days=5, start=date(2026, 11, 1))
    return inject_faults(sim.events, {"duplicate": 15, "missing_field": 3}, seed=7)


def _key(event) -> str:
    return json.dumps(event, sort_keys=True)


def test_batch_cap_is_the_shared_batch_schema_max_items(repo_root):
    path = repo_root / "packages/shared/json-schema/analytics-event-batch.schema.json"
    schema = json.loads(path.read_text(encoding="utf-8"))
    assert BATCH_MAX_EVENTS == schema["properties"]["events"]["maxItems"] == 50


def test_one_script_per_user_in_first_seen_order(faulted):
    scripts = build_plan(faulted.events)
    users = [e["userId"] for e in faulted.events if isinstance(e.get("userId"), str)]
    assert [s.key for s in scripts if s.key.startswith("sim-u-")] == list(dict.fromkeys(users))


def test_every_event_is_sent_exactly_once_in_stream_order_per_user(faulted):
    scripts = build_plan(faulted.events, batch_size=7)
    sent = [e for s in scripts for b in s.batches for e in b]
    assert Counter(map(_key, sent)) == Counter(map(_key, faulted.events))
    position = {}
    for i, event in enumerate(faulted.events):
        position.setdefault(_key(event), []).append(i)
    for script in scripts:
        mine = [e for b in script.batches for e in b]
        order = [position[_key(e)].pop(0) for e in mine]
        assert order == sorted(order)
        assert all(1 <= len(b) <= 7 for b in script.batches)
        assert script.n_events == len(mine)


def test_a_duplicate_goes_to_the_same_script_after_its_original(faulted):
    scripts = build_plan(faulted.events)
    duplicates = [r for r in faulted.faults if r.fault == "duplicate"]
    assert duplicates
    for record in duplicates:
        holders = [
            [e.get("eventId") for b in s.batches for e in b]
            for s in scripts
            if any(e.get("eventId") == record.event_id for b in s.batches for e in b)
        ]
        assert len(holders) == 1
        assert holders[0].count(record.event_id) == 2


def test_an_event_without_a_string_user_falls_back_to_its_session():
    events = [
        {"eventId": "a", "userId": None, "sessionId": "sim-s-1"},
        {"eventId": "b", "sessionId": "sim-s-1"},
        {"eventId": "c", "userId": 5},
        "not an event",
    ]
    scripts = build_plan(events)
    assert [s.key for s in scripts] == ["sim-s-1", "unkeyed"]
    assert scripts[1].n_events == 2


def test_batch_size_is_checked():
    with pytest.raises(ValueError, match="batch_size"):
        build_plan([], batch_size=BATCH_MAX_EVENTS + 1)
    with pytest.raises(ValueError, match="batch_size"):
        build_plan([], batch_size=0)


def test_plan_round_trips_and_is_marked_simulated(tmp_path, faulted):
    scripts = build_plan(faulted.events)
    path = tmp_path / "plan.json"
    write_plan(scripts, path)
    assert json.loads(path.read_text(encoding="utf-8"))["simulated"] is True
    assert read_plan(path) == scripts


def test_read_plan_refuses_a_file_not_marked_simulated(tmp_path):
    path = tmp_path / "plan.json"
    path.write_text(json.dumps({"scripts": []}), encoding="utf-8")
    with pytest.raises(ValueError, match="simulated"):
        read_plan(path)
