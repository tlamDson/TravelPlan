import pytest

from simkit.personas import ACTIONS, END, PERSONAS, START, Persona


def _rows(**overrides):
    rows = {state: dict(row) for state, row in PERSONAS[0].transitions.items()}
    rows.update(overrides)
    return rows


def test_actions_are_the_seven_web_events() -> None:
    assert ACTIONS == (
        "wizard_started",
        "trip_generation_requested",
        "trip_generation_completed",
        "trip_viewed",
        "itinerary_edited",
        "trip_saved",
        "calendar_synced",
    )


def test_three_personas_with_shares_summing_to_one() -> None:
    assert [p.name for p in PERSONAS] == ["browser", "planner", "power"]
    assert sum(p.weight for p in PERSONAS) == pytest.approx(1.0)


@pytest.mark.parametrize("persona", PERSONAS, ids=lambda p: p.name)
def test_every_row_is_a_probability_distribution(persona: Persona) -> None:
    assert set(persona.transitions) == {START, *ACTIONS}
    for state in persona.transitions:
        row = persona.row(state)
        assert [name for name, _ in row] == [*ACTIONS, END]
        assert sum(p for _, p in row) == pytest.approx(1.0)
        assert all(p >= 0 for _, p in row)


@pytest.mark.parametrize("persona", PERSONAS, ids=lambda p: p.name)
def test_heavier_personas_save_more_often_from_a_trip_view(persona: Persona) -> None:
    saves = [dict(p.row("trip_viewed"))["trip_saved"] for p in PERSONAS]
    assert saves == sorted(saves)
    assert dict(persona.row("trip_viewed"))["trip_saved"] > 0


def test_row_sum_must_be_one() -> None:
    with pytest.raises(ValueError, match="sum to 1"):
        Persona("x", 1.0, 1.0, _rows(trip_saved={"end": 0.5}))


def test_unknown_destination_is_rejected() -> None:
    with pytest.raises(ValueError, match="unknown state"):
        Persona("x", 1.0, 1.0, _rows(trip_saved={"trip_deleted": 1.0}))


def test_every_state_needs_a_row() -> None:
    rows = _rows()
    del rows["calendar_synced"]
    with pytest.raises(ValueError, match="calendar_synced"):
        Persona("x", 1.0, 1.0, rows)


def test_session_cannot_be_empty() -> None:
    with pytest.raises(ValueError, match="empty session"):
        Persona("x", 1.0, 1.0, _rows(start={"end": 1.0}))


def test_completion_only_follows_a_request() -> None:
    with pytest.raises(ValueError, match="trip_generation_completed"):
        Persona("x", 1.0, 1.0, _rows(trip_viewed={"trip_generation_completed": 1.0}))


def test_negative_probability_is_rejected() -> None:
    with pytest.raises(ValueError, match="non-negative"):
        Persona("x", 1.0, 1.0, _rows(trip_saved={"end": 1.5, "trip_viewed": -0.5}))


@pytest.mark.parametrize(("weight", "sessions"), [(0.0, 1.0), (1.0, -0.1)])
def test_weight_and_session_rate_are_checked(weight: float, sessions: float) -> None:
    with pytest.raises(ValueError):
        Persona("x", weight, sessions, _rows())
