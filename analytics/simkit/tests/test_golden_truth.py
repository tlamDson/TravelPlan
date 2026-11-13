"""G-sim truth: both potential outcomes of the same simulated users, never an estimator."""

from collections import Counter
from datetime import timedelta

import pytest

from simkit._common import parse_ts
from simkit.generator import simulate
from simkit.golden_cases import START, SimCase
from simkit.golden_truth import data_columns, observe, truth

SMALL = {"users": 400, "days": 10, "window_days": 5}


def _case(**overrides) -> SimCase:
    fields = {"group": "sim-effect", "name": "tiny", "description": "A tiny case.", "first_seed": 7}
    return SimCase(**{**fields, **SMALL, **overrides})


def _window_counts(case: SimCase, events, first_exposed: dict[str, str]) -> Counter:
    """Saves per user in [first exposure, + window), counted straight from the event list."""
    counts: Counter = Counter()
    for event in events:
        first = first_exposed.get(event["userId"])
        if first is None or event["name"] != "trip_saved":
            continue
        start = parse_ts(first)
        if start <= parse_ts(event["occurredAt"]) < start + timedelta(days=case.window_days):
            counts[event["userId"]] += 1
    return counts


def test_a_zero_lift_case_has_identical_potential_outcomes() -> None:
    case = _case(group="sim-aa", lift={})
    users = observe(case, 7)
    assert len(users) > 100
    assert all(u.y0 == u.y1 for u in users)
    expected, tolerance = truth(case, users)
    assert expected == {"srm": False, "estimate": 0.0}
    assert tolerance["estimate"]["abs"] > 0
    assert tolerance["default"] == {"abs": 0.0, "rel": 0.0}


def test_observed_data_is_the_plain_simkit_run_of_the_experiment() -> None:
    case = _case(lift={"planner": 0.8, "power": 0.8})
    users = observe(case, 7)
    sim = simulate(
        seed=7, users=case.users, days=case.days, start=START, experiment=case.experiment()
    )
    first = {u.user_id: u.first_exposed_at for u in sim.users if u.first_exposed_at}
    variant = {u.user_id: u.variant for u in sim.users}
    counts = _window_counts(case, sim.events, first)
    columns = data_columns(case, users)
    assert columns["variant"] == [variant[u.user_id] for u in users]
    assert columns["saves"] == [counts[u.user_id] for u in users]
    observed = [u.y1 if u.variant == "treatment" else u.y0 for u in users]
    assert columns["saves"] == [o["saves"] for o in observed]
    # The lift only ever adds saves in this case's personas, so treated outcomes differ somewhere.
    assert any(u.y1 != u.y0 for u in users if u.persona in {"planner", "power"})
    assert all(u.y1 == u.y0 for u in users if u.persona == "browser")


def test_only_users_with_a_full_window_are_enrolled() -> None:
    case = _case()
    users = observe(case, 7)
    assert users
    assert max(u.exposure_day for u in users) < case.days - case.window_days


def test_exposure_loss_drops_treatment_users_from_the_data() -> None:
    lossless = observe(_case(group="sim-srm", name="tiny"), 7)
    lossy_case = _case(group="sim-srm", exposure_loss=0.5)
    lossy = observe(lossy_case, 7)
    control = {u.user_id for u in lossless if u.variant == "control"}
    assert {u.user_id for u in lossy if u.variant == "control"} == control
    kept = sum(u.variant == "treatment" for u in lossy)
    assert 0 < kept < 0.75 * sum(u.variant == "treatment" for u in lossless)
    expected, _ = truth(lossy_case, lossy)
    assert expected == {"srm": True}


def test_ratio_value_and_novelty_cases_carry_their_columns() -> None:
    users = observe(_case(metric="ratio"), 7)
    assert set(data_columns(_case(metric="ratio"), users)) == {
        "variant",
        "persona",
        "saves",
        "views",
    }
    value_case = _case(metric="value")
    value = data_columns(value_case, observe(value_case, 7))
    assert set(value) == {"variant", "persona", "value"}
    assert all(v >= 0 and round(v, 2) == v for v in value["value"])
    late_case = _case(metric="late", window_days=4, novelty=0.5)
    late = observe(late_case, 7)
    assert set(data_columns(late_case, late)) == {"variant", "persona", "saves_early", "saves_late"}
    expected, tolerance = truth(late_case, late)
    assert set(expected) == {"srm", "estimate", "early_estimate"}
    assert set(tolerance) == {"default", "estimate", "early_estimate"}
    peek_case = _case(peeking=True)
    assert "exposure_day" in data_columns(peek_case, observe(peek_case, 7))


def test_by_persona_truth_has_one_estimate_per_persona() -> None:
    case = _case(lift={"power": 0.8}, by_persona=True)
    expected, tolerance = truth(case, observe(case, 7))
    assert set(expected) == {
        "srm",
        "estimate",
        "estimate_browser",
        "estimate_planner",
        "estimate_power",
    }
    assert expected["estimate_browser"] == 0.0
    assert expected["estimate_planner"] == 0.0
    assert expected["estimate_power"] > 0
    assert all(tolerance[k]["abs"] > 0 for k in expected if k.startswith("estimate"))


def test_mixed_sign_lifts_have_no_single_right_decision() -> None:
    with pytest.raises(ValueError, match="mixed"):
        _case(lift={"planner": 0.5, "power": -0.5})
