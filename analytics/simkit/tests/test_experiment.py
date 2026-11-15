from collections import Counter, defaultdict
from datetime import date

import pytest
from abkit.assignment import HOLDOUT_VARIANT, assign_variant, parse_definition

from simkit.catalog import replay_ingest
from simkit.experiment import Experiment, apply_lift, parse_experiment
from simkit.generator import simulate
from simkit.personas import END

START = date(2026, 11, 1)
AB_DEFINITION = {
    "key": "save-trip-cta-v1",
    "salt": "sim",
    "holdoutBuckets": 0,
    "variants": [
        {"key": "control", "weight": 5000},
        {"key": "treatment", "weight": 5000},
    ],
}


def _strip(events, name="experiment_exposure"):
    """Events without exposures and without ids (ids are drawn after the final order is known)."""
    return [{k: v for k, v in e.items() if k != "eventId"} for e in events if e["name"] != name]


def _exposures(events):
    return [e for e in events if e["name"] == "experiment_exposure"]


@pytest.fixture(scope="module")
def ab_sim():
    experiment = Experiment(
        definition=parse_definition(AB_DEFINITION),
        relative_lift={"treatment": {"planner": 0.5, "power": 0.5}},
    )
    return simulate(seed=3, users=300, days=5, start=START, experiment=experiment)


def test_users_get_the_server_assignment(ab_sim) -> None:
    definition = parse_definition(AB_DEFINITION)
    for user in ab_sim.users:
        assert (user.bucket, user.variant) == assign_variant(definition, user.user_id)


def test_exposure_events_are_server_events_that_pass_g_event(ab_sim) -> None:
    replay = replay_ingest(ab_sim.events)
    assert replay.counts()["accepted"] == len(ab_sim.events)
    variant_of = {u.user_id: u for u in ab_sim.users}
    exposures = _exposures(ab_sim.events)
    assert exposures
    for event in exposures:
        user = variant_of[event["userId"]]
        assert event["source"] == "server"
        assert event["properties"] == {
            "experimentKey": "save-trip-cta-v1",
            "variant": user.variant,
            "bucket": user.bucket,
        }


def test_one_exposure_per_session_at_the_first_exposure_state(ab_sim) -> None:
    per_session = Counter(e["sessionId"] for e in _exposures(ab_sim.events))
    assert set(per_session.values()) == {1}
    by_session = defaultdict(list)
    for event in ab_sim.events:
        by_session[event["sessionId"]].append(event)
    for session_id, events in by_session.items():
        names = [e["name"] for e in events]
        triggers = [
            i for i, n in enumerate(names) if n in ("trip_generation_completed", "trip_viewed")
        ]
        if not triggers:
            assert "experiment_exposure" not in names
            continue
        first = triggers[0]
        assert names[first - 1] == "experiment_exposure", session_id
        assert events[first - 1]["occurredAt"] == events[first]["occurredAt"]


def test_first_exposure_time_is_recorded(ab_sim) -> None:
    first = {}
    for event in _exposures(ab_sim.events):
        first.setdefault(event["userId"], event["occurredAt"])
    for user in ab_sim.users:
        assert user.first_exposed_at == first.get(user.user_id)
        assert user.exposure_logged is True


def test_control_users_behave_exactly_as_without_the_experiment(ab_sim) -> None:
    plain = simulate(seed=3, users=300, days=5, start=START)
    control = {u.user_id for u in ab_sim.users if u.variant == "control"}
    assert control
    with_exp = [e for e in _strip(ab_sim.events) if e["userId"] in control]
    without = [e for e in _strip(plain.events) if e["userId"] in control]
    assert with_exp == without


def test_zero_lift_is_an_a_a_test() -> None:
    aa = Experiment(definition=parse_definition(AB_DEFINITION))
    with_exp = simulate(seed=5, users=100, days=3, start=START, experiment=aa)
    plain = simulate(seed=5, users=100, days=3, start=START)
    assert _strip(with_exp.events) == _strip(plain.events)


def test_lift_raises_the_target_rate_only_for_lifted_personas() -> None:
    experiment = Experiment(
        definition=parse_definition(AB_DEFINITION),
        relative_lift={"treatment": {"power": 1.0}},
    )
    sim = simulate(seed=11, users=3000, days=3, start=START, experiment=experiment)
    users = {u.user_id: u for u in sim.users}
    saves = Counter()
    views = Counter()
    for event in sim.events:
        user = users[event["userId"]]
        key = (user.persona, user.variant)
        if event["name"] == "trip_saved":
            saves[key] += 1
        elif event["name"] == "trip_viewed":
            views[key] += 1
    rate = {k: saves[k] / views[k] for k in views}
    assert rate[("power", "treatment")] > 1.4 * rate[("power", "control")]
    assert rate[("browser", "treatment")] == pytest.approx(rate[("browser", "control")], rel=0.35)


def test_exposure_loss_drops_every_exposure_of_the_chosen_users() -> None:
    experiment = Experiment(
        definition=parse_definition(AB_DEFINITION),
        exposure_loss={"treatment": 0.5},
    )
    sim = simulate(seed=9, users=400, days=3, start=START, experiment=experiment)
    exposed = {e["userId"] for e in _exposures(sim.events)}
    lost = [u for u in sim.users if not u.exposure_logged]
    assert lost
    assert all(u.variant == "treatment" for u in lost)
    assert not exposed & {u.user_id for u in lost}
    share = len(lost) / sum(u.variant == "treatment" for u in sim.users)
    assert share == pytest.approx(0.5, abs=0.1)


def test_exposure_loss_keeps_behaviour_unchanged() -> None:
    definition = parse_definition(AB_DEFINITION)
    lossy = simulate(
        seed=9,
        users=100,
        days=3,
        start=START,
        experiment=Experiment(definition=definition, exposure_loss={"treatment": 1.0}),
    )
    plain = simulate(seed=9, users=100, days=3, start=START)
    assert _strip(lossy.events) == _strip(plain.events)


def test_holdout_users_are_exposed_with_the_holdout_variant() -> None:
    definition = parse_definition(
        {
            **AB_DEFINITION,
            "holdoutBuckets": 2000,
            "variants": [
                {"key": "control", "weight": 4000},
                {"key": "treatment", "weight": 4000},
            ],
        }
    )
    sim = simulate(seed=2, users=200, days=2, start=START, experiment=Experiment(definition))
    variants = {e["properties"]["variant"] for e in _exposures(sim.events)}
    assert HOLDOUT_VARIANT in variants


def test_novelty_lift_halves_every_half_life() -> None:
    experiment = Experiment(
        definition=parse_definition(AB_DEFINITION),
        relative_lift={"treatment": {"planner": 0.1}},
        novelty_lift={"treatment": 0.4},
        novelty_half_life_days=2.0,
    )
    assert experiment.lift("treatment", "planner", 0.0) == pytest.approx(0.5)
    assert experiment.lift("treatment", "planner", 2.0) == pytest.approx(0.3)
    assert experiment.lift("treatment", "browser", 4.0) == pytest.approx(0.1)
    assert experiment.lift("control", "planner", 0.0) == 0.0


def test_apply_lift_rescales_the_rest_of_the_row() -> None:
    row = (("trip_saved", 0.2), ("trip_viewed", 0.3), (END, 0.5))
    lifted = dict(apply_lift(row, "trip_saved", 0.5))
    assert lifted["trip_saved"] == pytest.approx(0.3)
    assert lifted["trip_viewed"] == pytest.approx(0.3 * 0.7 / 0.8)
    assert lifted[END] == pytest.approx(0.5 * 0.7 / 0.8)
    assert sum(lifted.values()) == pytest.approx(1.0)


def test_apply_lift_caps_at_one_and_leaves_impossible_targets_alone() -> None:
    row = (("trip_saved", 0.8), (END, 0.2))
    assert dict(apply_lift(row, "trip_saved", 1.0)) == {"trip_saved": 1.0, END: 0.0}
    zero = (("trip_saved", 0.0), (END, 1.0))
    assert apply_lift(zero, "trip_saved", 5.0) == zero
    assert apply_lift(row, "trip_saved", 0.0) == row


def test_parse_experiment_reads_camel_case_json() -> None:
    experiment = parse_experiment(
        {
            "definition": AB_DEFINITION,
            "target": "trip_saved",
            "relativeLift": {"treatment": {"planner": 0.03}},
            "noveltyLift": {"treatment": 0.02},
            "noveltyHalfLifeDays": 3,
            "exposureStates": ["trip_viewed"],
            "exposureLoss": {"control": 0.1},
        }
    )
    assert experiment.definition.key == "save-trip-cta-v1"
    assert experiment.exposure_states == ("trip_viewed",)
    assert experiment.lift("treatment", "planner", 0.0) == pytest.approx(0.05)
    assert experiment.to_dict()["relativeLift"] == {"treatment": {"planner": 0.03}}


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"relativeLift": {"nope": {"planner": 0.1}}}, "variant"),
        ({"relativeLift": {"treatment": {"tourist": 0.1}}}, "persona"),
        ({"relativeLift": {"treatment": {"planner": -1.0}}}, "lift"),
        ({"target": "trip_generation_completed"}, "target"),
        ({"exposureStates": ["trip_deleted"]}, "exposure state"),
        ({"exposureLoss": {"treatment": 1.5}}, "exposureLoss"),
        ({"noveltyHalfLifeDays": 0}, "half-life"),
        ({"surprise": True}, "unknown"),
    ],
)
def test_parse_experiment_rejects_bad_config(override, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        parse_experiment({"definition": AB_DEFINITION, **override})
