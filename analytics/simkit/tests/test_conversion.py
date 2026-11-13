"""Exact P(a session reaches trip_saved) from a persona's Markov chain."""

import random

import pytest

from simkit.conversion import save_probability
from simkit.generator import _pick
from simkit.personas import ACTIONS, END, PERSONAS, START, Persona

_QUIET = {state: {END: 1.0} for state in ACTIONS}


def _toy(**rows) -> Persona:
    return Persona("toy", 1.0, 1.0, {**_QUIET, **rows})


def test_a_straight_path_multiplies_its_steps() -> None:
    persona = _toy(
        start={"wizard_started": 1.0},
        wizard_started={"trip_generation_requested": 0.5, END: 0.5},
        trip_generation_requested={"trip_generation_completed": 1.0},
        trip_generation_completed={"trip_saved": 0.4, END: 0.6},
    )
    assert save_probability(persona) == pytest.approx(0.5 * 0.4, abs=1e-12)


def test_a_self_loop_is_a_geometric_series() -> None:
    # h = 0.25 + 0.5 h  ->  h = 0.5
    persona = _toy(
        start={"trip_viewed": 1.0}, trip_viewed={"trip_viewed": 0.5, "trip_saved": 0.25, END: 0.25}
    )
    assert save_probability(persona) == pytest.approx(0.5, abs=1e-12)


def test_lift_multiplies_every_transition_into_the_target() -> None:
    persona = _toy(
        start={"trip_viewed": 1.0},
        trip_viewed={"trip_viewed": 0.5, "trip_saved": 0.25, END: 0.25},
    )
    # With +20%: P(save) = 0.3, the other 0.7 rescaled from 0.75 -> loop 0.5*0.7/0.75.
    loop = 0.5 * 0.7 / 0.75
    assert save_probability(persona, lift=0.2) == pytest.approx(0.3 / (1 - loop), abs=1e-12)


def test_a_target_that_is_never_reached_has_probability_zero() -> None:
    persona = _toy(start={"wizard_started": 1.0})
    assert save_probability(persona) == 0.0
    assert save_probability(persona, target="calendar_synced") == 0.0


@pytest.mark.parametrize("persona", PERSONAS, ids=lambda p: p.name)
def test_matches_a_monte_carlo_walk_of_the_persona(persona: Persona) -> None:
    rng = random.Random(f"conversion:{persona.name}")
    sessions, saved = 40_000, 0
    for _ in range(sessions):
        state = START
        while state not in (END, "trip_saved"):
            state = _pick(rng, persona.row(state))
        saved += state == "trip_saved"
    p = save_probability(persona)
    se = (p * (1 - p) / sessions) ** 0.5
    assert abs(saved / sessions - p) < 4 * se


def test_heavier_personas_save_more_often() -> None:
    by_name = {p.name: save_probability(p) for p in PERSONAS}
    assert 0 < by_name["browser"] < by_name["planner"] < by_name["power"] < 1


def test_bad_arguments_raise() -> None:
    persona = PERSONAS[0]
    with pytest.raises(ValueError, match="target"):
        save_probability(persona, target="experiment_exposure")
    with pytest.raises(ValueError, match="lift"):
        save_probability(persona, lift=-1.0)
