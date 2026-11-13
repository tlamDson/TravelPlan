"""Personas of the SIMULATED TravelPlan users: a Markov chain over the 7 web actions.

Each session starts in ``START`` and walks ``transitions`` until it reaches ``END``. A row maps
the current state to the probability of each next state; missing destinations are 0.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

ACTIONS = (
    "wizard_started",
    "trip_generation_requested",
    "trip_generation_completed",
    "trip_viewed",
    "itinerary_edited",
    "trip_saved",
    "calendar_synced",
)
START = "start"
END = "end"
DESTINATIONS = (*ACTIONS, END)
COMPLETION = "trip_generation_completed"
REQUEST = "trip_generation_requested"

Row = tuple[tuple[str, float], ...]


@dataclass(frozen=True)
class Persona:
    name: str
    weight: float  # share of simulated users with this persona
    sessions_per_day: float  # Poisson mean, on days after the first active day
    transitions: Mapping[str, Mapping[str, float]]

    def __post_init__(self) -> None:
        if not self.weight > 0:
            raise ValueError(f"persona {self.name}: weight must be > 0, got {self.weight!r}")
        if not self.sessions_per_day >= 0:
            raise ValueError(f"persona {self.name}: sessions_per_day must be >= 0")
        missing = [s for s in (START, *ACTIONS) if s not in self.transitions]
        extra = [s for s in self.transitions if s not in (START, *ACTIONS)]
        if missing or extra:
            raise ValueError(f"persona {self.name}: rows missing {missing}, unknown state {extra}")
        rows = {state: self._check_row(state, row) for state, row in self.transitions.items()}
        if dict(rows[START])[END] > 0:
            raise ValueError(f"persona {self.name}: START -> END would be an empty session")
        for state, row in rows.items():
            if state != REQUEST and dict(row)[COMPLETION] > 0:
                raise ValueError(f"persona {self.name}: {COMPLETION} may only follow {REQUEST}")
        object.__setattr__(self, "_rows", rows)

    def _check_row(self, state: str, row: Mapping[str, float]) -> Row:
        unknown = [d for d in row if d not in DESTINATIONS]
        if unknown:
            raise ValueError(f"persona {self.name}: row {state} has unknown state {unknown}")
        if any(p < 0 for p in row.values()):
            raise ValueError(f"persona {self.name}: row {state} needs non-negative probabilities")
        if not math.isclose(sum(row.values()), 1.0, abs_tol=1e-9):
            raise ValueError(f"persona {self.name}: row {state} must sum to 1")
        return tuple((d, float(row.get(d, 0.0))) for d in DESTINATIONS)

    def row(self, state: str) -> Row:
        """Next-state probabilities from ``state``, in ``DESTINATIONS`` order."""
        return self._rows[state]  # type: ignore[attr-defined]


PERSONAS: tuple[Persona, ...] = (
    Persona(
        "browser",
        0.50,
        0.4,
        {
            START: {"wizard_started": 0.6, "trip_viewed": 0.4},
            "wizard_started": {REQUEST: 0.35, END: 0.65},
            REQUEST: {COMPLETION: 0.95, END: 0.05},
            COMPLETION: {"trip_viewed": 0.7, "trip_saved": 0.05, END: 0.25},
            "trip_viewed": {
                "itinerary_edited": 0.1,
                "trip_saved": 0.08,
                "trip_viewed": 0.1,
                END: 0.72,
            },
            "itinerary_edited": {
                "itinerary_edited": 0.2,
                "trip_viewed": 0.2,
                "trip_saved": 0.1,
                END: 0.5,
            },
            "trip_saved": {"calendar_synced": 0.05, "trip_viewed": 0.15, END: 0.8},
            "calendar_synced": {"trip_viewed": 0.2, END: 0.8},
        },
    ),
    Persona(
        "planner",
        0.35,
        1.0,
        {
            START: {"wizard_started": 0.5, "trip_viewed": 0.5},
            "wizard_started": {REQUEST: 0.7, END: 0.3},
            REQUEST: {COMPLETION: 0.98, END: 0.02},
            COMPLETION: {
                "trip_viewed": 0.75,
                "trip_saved": 0.15,
                "itinerary_edited": 0.05,
                END: 0.05,
            },
            "trip_viewed": {
                "itinerary_edited": 0.35,
                "trip_saved": 0.2,
                "trip_viewed": 0.1,
                "wizard_started": 0.05,
                END: 0.3,
            },
            "itinerary_edited": {
                "itinerary_edited": 0.35,
                "trip_viewed": 0.15,
                "trip_saved": 0.3,
                END: 0.2,
            },
            "trip_saved": {
                "calendar_synced": 0.25,
                "trip_viewed": 0.15,
                "wizard_started": 0.1,
                END: 0.5,
            },
            "calendar_synced": {"trip_viewed": 0.2, "wizard_started": 0.1, END: 0.7},
        },
    ),
    Persona(
        "power",
        0.15,
        2.5,
        {
            START: {"wizard_started": 0.4, "trip_viewed": 0.6},
            "wizard_started": {REQUEST: 0.85, END: 0.15},
            REQUEST: {COMPLETION: 1.0},
            COMPLETION: {
                "trip_viewed": 0.6,
                "trip_saved": 0.25,
                "itinerary_edited": 0.1,
                END: 0.05,
            },
            "trip_viewed": {
                "itinerary_edited": 0.4,
                "trip_saved": 0.3,
                "trip_viewed": 0.1,
                "wizard_started": 0.05,
                END: 0.15,
            },
            "itinerary_edited": {
                "itinerary_edited": 0.45,
                "trip_viewed": 0.1,
                "trip_saved": 0.35,
                END: 0.1,
            },
            "trip_saved": {
                "calendar_synced": 0.45,
                "wizard_started": 0.2,
                "trip_viewed": 0.15,
                END: 0.2,
            },
            "calendar_synced": {"wizard_started": 0.3, "trip_viewed": 0.3, END: 0.4},
        },
    ),
)
