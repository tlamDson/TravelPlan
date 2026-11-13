"""Planted faults must land exactly where the G-event ingest rules say they will."""

import copy
from datetime import date

import pytest
from abkit.assignment import parse_definition

from simkit.catalog import replay_ingest
from simkit.experiment import Experiment
from simkit.faults import FAULT_TYPES, inject_faults
from simkit.generator import simulate

START = date(2026, 11, 1)
DEFINITION = {
    "key": "save-trip-cta-v1",
    "salt": "sim",
    "holdoutBuckets": 0,
    "variants": [{"key": "control", "weight": 5000}, {"key": "treatment", "weight": 5000}],
}
EXPECTED = {
    "duplicate": ("duplicate", None),
    "missing_field": ("quarantined", "missing_field"),
    "wrong_type": ("quarantined", "wrong_type"),
    "unknown_field": ("quarantined", "unknown_field"),
    "unknown_event": ("quarantined", "unknown_event"),
    "wrong_source": ("quarantined", "wrong_source"),
}
ALL = {
    "duplicate": 6,
    "missing_field": 5,
    "wrong_type": 5,
    "unknown_field": 4,
    "unknown_event": 3,
    "wrong_source": 3,
}


@pytest.fixture(scope="module")
def clean():
    experiment = Experiment(definition=parse_definition(DEFINITION))
    return simulate(seed=21, users=80, days=3, start=START, experiment=experiment).events


def test_fault_types_match_the_g_event_outcomes() -> None:
    assert tuple(EXPECTED) == FAULT_TYPES


def test_no_faults_returns_the_input_unchanged(clean) -> None:
    result = inject_faults(clean, {}, seed=1)
    assert result.events == clean
    assert result.faults == ()
    assert result.expected_ingest() == {
        "received": len(clean),
        "accepted": len(clean),
        "duplicates": 0,
        "quarantined": 0,
    }


@pytest.mark.parametrize("fault", FAULT_TYPES)
def test_each_fault_gets_the_outcome_g_event_predicts(clean, fault: str) -> None:
    result = inject_faults(clean, {fault: 3}, seed=4)
    replay = replay_ingest(result.events)
    outcome, reason = EXPECTED[fault]
    assert len(result.faults) == 3
    for record in result.faults:
        assert record.fault == fault
        assert (record.expected_outcome, record.expected_reason) == (outcome, reason)
        got = replay.outcomes[record.index]
        assert (got.outcome, got.reason) == (outcome, reason)
    assert replay.counts() == result.expected_ingest()


def test_all_faults_together_match_the_manifest(clean) -> None:
    result = inject_faults(clean, ALL, seed=8)
    replay = replay_ingest(result.events)
    assert result.counts() == ALL
    assert replay.counts() == result.expected_ingest()
    assert result.expected_ingest() == {
        "received": len(clean) + 6,
        "accepted": len(clean) - 20,
        "duplicates": 6,
        "quarantined": 20,
    }
    faulted = {r.index for r in result.faults}
    assert len(faulted) == len(result.faults)
    clean_outcomes = [o for i, o in enumerate(replay.outcomes) if i not in faulted]
    assert {o.outcome for o in clean_outcomes} == {"accepted"}


def test_duplicate_copy_comes_after_its_original(clean) -> None:
    result = inject_faults(clean, {"duplicate": 5}, seed=2)
    for record in result.faults:
        original = record.detail["originalIndex"]
        assert original < record.index
        assert result.events[original] == result.events[record.index]
        assert result.events[record.index]["eventId"] == record.event_id


def test_wrong_source_only_targets_exposures(clean) -> None:
    result = inject_faults(clean, {"wrong_source": 4}, seed=3)
    for record in result.faults:
        event = result.events[record.index]
        assert event["name"] == "experiment_exposure"
        assert event["source"] == "web"


def test_same_seed_same_faults(clean) -> None:
    a = inject_faults(clean, ALL, seed=5)
    b = inject_faults(clean, ALL, seed=5)
    assert a.events == b.events
    assert a.manifest() == b.manifest()


def test_input_is_not_modified(clean) -> None:
    before = copy.deepcopy(clean)
    inject_faults(clean, ALL, seed=6)
    assert clean == before


def test_manifest_is_marked_simulated_and_sorted(clean) -> None:
    manifest = inject_faults(clean, ALL, seed=7).manifest()
    assert manifest["simulated"] is True
    assert manifest["counts"] == ALL
    indices = [f["index"] for f in manifest["faults"]]
    assert indices == sorted(indices)
    assert {"fault", "index", "eventId", "expectedOutcome", "expectedReason", "detail"} <= set(
        manifest["faults"][0]
    )


@pytest.mark.parametrize(
    ("counts", "message"),
    [
        ({"late": 1}, "unknown fault"),
        ({"duplicate": -1}, "non-negative"),
        ({"duplicate": True}, "non-negative"),
        ({"wrong_type": 10_000}, "eligible"),
    ],
)
def test_bad_counts_raise(clean, counts, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        inject_faults(clean, counts, seed=1)


def test_wrong_source_needs_exposure_events() -> None:
    plain = simulate(seed=1, users=20, days=2, start=START).events
    with pytest.raises(ValueError, match="experiment_exposure"):
        inject_faults(plain, {"wrong_source": 1}, seed=1)


@pytest.mark.parametrize(
    "spoil",
    [
        lambda events: events.__setitem__(0, {**events[0], "schemaVersion": 9}),
        lambda events: events.append(dict(events[1])),
    ],
    ids=["invalid", "repeated"],
)
def test_input_must_be_clean(clean, spoil) -> None:
    events = [dict(e) for e in clean[:30]]
    spoil(events)
    with pytest.raises(ValueError, match="clean"):
        inject_faults(events, {"missing_field": 1}, seed=1)


def test_every_clean_event_can_be_a_target(clean) -> None:
    events = clean[:30]
    result = inject_faults(events, {"missing_field": 30}, seed=1)
    assert {r.index for r in result.faults} == set(range(30))
