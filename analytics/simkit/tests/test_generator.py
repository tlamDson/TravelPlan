from collections import Counter, defaultdict
from datetime import date

import pytest

from simkit._common import parse_ts
from simkit.catalog import replay_ingest
from simkit.export import to_jsonl
from simkit.generator import MAX_EVENTS_PER_SESSION, simulate
from simkit.personas import ACTIONS, PERSONAS

START = date(2026, 11, 1)


@pytest.fixture(scope="module")
def sim():
    return simulate(seed=42, users=200, days=7, start=START)


def test_same_seed_gives_the_same_bytes() -> None:
    a = simulate(seed=7, users=30, days=3, start=START)
    b = simulate(seed=7, users=30, days=3, start=START)
    assert to_jsonl(a.events) == to_jsonl(b.events)
    assert a.users == b.users


def test_other_seed_gives_other_events() -> None:
    a = simulate(seed=7, users=30, days=3, start=START)
    b = simulate(seed=8, users=30, days=3, start=START)
    assert to_jsonl(a.events) != to_jsonl(b.events)


def test_every_clean_event_passes_g_event_ingest(sim) -> None:
    replay = replay_ingest(sim.events)
    assert replay.counts() == {
        "received": len(sim.events),
        "accepted": len(sim.events),
        "duplicates": 0,
        "quarantined": 0,
    }


def test_all_seven_actions_occur_and_nothing_else(sim) -> None:
    names = Counter(e["name"] for e in sim.events)
    assert set(names) == set(ACTIONS)


def test_simulated_ids_are_marked(sim) -> None:
    assert all(u.user_id.startswith("sim-u-") for u in sim.users)
    for event in sim.events:
        assert event["userId"].startswith("sim-u-")
        assert event["sessionId"].startswith("sim-s-")
        assert event["source"] == "web"


def test_events_are_sorted_by_time_and_inside_the_window(sim) -> None:
    times = [e["occurredAt"] for e in sim.events]
    assert times == sorted(times)
    assert times[0] >= "2026-11-01T00:00:00.000Z"
    assert all(t.endswith("Z") and len(t) == 24 for t in times)


def test_event_ids_are_unique(sim) -> None:
    ids = [e["eventId"] for e in sim.events]
    assert len(set(ids)) == len(ids)


def test_one_user_per_requested_count_with_known_personas(sim) -> None:
    assert len(sim.users) == 200
    assert {u.persona for u in sim.users} == {p.name for p in PERSONAS}
    assert all(u.variant is None and u.bucket is None for u in sim.users)


def test_persona_shares_follow_the_weights() -> None:
    big = simulate(seed=1, users=3000, days=1, start=START)
    shares = Counter(u.persona for u in big.users)
    for persona in PERSONAS:
        assert shares[persona.name] / 3000 == pytest.approx(persona.weight, abs=0.03)


def test_completion_follows_its_request_in_the_same_session(sim) -> None:
    requested = {}
    for event in sim.events:
        props = event["properties"]
        if event["name"] == "trip_generation_requested":
            requested[props["jobId"]] = event
        elif event["name"] == "trip_generation_completed":
            request = requested[props["jobId"]]
            assert request["sessionId"] == event["sessionId"]
            assert request["occurredAt"] < event["occurredAt"]
            gap = parse_ts(event["occurredAt"]) - parse_ts(request["occurredAt"])
            assert gap.total_seconds() * 1000 == pytest.approx(props["durationMs"], abs=1)


def test_trip_actions_point_at_an_earlier_trip_of_the_same_user(sim) -> None:
    trips: dict[str, dict] = {}
    durations = {}
    for event in sim.events:
        props = event["properties"]
        if event["name"] == "trip_generation_requested":
            durations[props["jobId"]] = props["durationDays"]
        elif event["name"] == "trip_generation_completed":
            trips[props["tripId"]] = {"user": event["userId"], "days": durations[props["jobId"]]}
        elif "tripId" in props:
            trip = trips[props["tripId"]]
            assert trip["user"] == event["userId"]
            if event["name"] == "itinerary_edited":
                assert 0 <= props["dayIndex"] < trip["days"]


def test_sessions_are_capped(sim) -> None:
    sizes = Counter(e["sessionId"] for e in sim.events)
    assert max(sizes.values()) <= MAX_EVENTS_PER_SESSION


def test_heavier_personas_produce_more_events_per_user(sim) -> None:
    persona_of = {u.user_id: u.persona for u in sim.users}
    per_user: dict[str, Counter] = defaultdict(Counter)
    for event in sim.events:
        per_user[persona_of[event["userId"]]][event["userId"]] += 1
    mean = {p: sum(c.values()) / len(c) for p, c in per_user.items()}
    assert mean["browser"] < mean["planner"] < mean["power"]


def test_zero_users_gives_no_events() -> None:
    assert simulate(seed=1, users=0, days=1, start=START).events == []


@pytest.mark.parametrize(
    "kwargs",
    [
        {"users": -1},
        {"users": True},
        {"days": 0},
        {"days": 1.5},
        {"start": "2026-11-01"},
    ],
)
def test_bad_parameters_raise(kwargs) -> None:
    params = {"seed": 1, "users": 1, "days": 1, "start": START, **kwargs}
    with pytest.raises(ValueError):
        simulate(**params)
