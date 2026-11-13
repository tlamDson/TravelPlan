"""Seeded generator of clean SIMULATED TravelPlan events (catalog shape, ``packages/shared``).

Every user draws from their own ``random.Random(f"{seed}:{number}")``, so one user's events do
not depend on the others. Choosing the next state always costs exactly one draw, with or
without an experiment, so a control (or zero-lift) user behaves bit for bit as with no
experiment at all; only treatment effects change paths. Event ids come last, from a separate
stream, once the final order is known. Every id is prefixed ``sim-`` so simulated users stay
separable from real ones once they go through the real ingest.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from simkit._common import check_int, fmt_ts, ms, new_event_id
from simkit.experiment import Experiment, apply_lift
from simkit.personas import COMPLETION, END, PERSONAS, REQUEST, START, Persona, Row

MIN_EVENT_GAP_MS = 5_000
MAX_EVENT_GAP_MS = 120_000
GENERATION_MS = (20_000, 180_000)  # time from request to completion, also its durationMs
MAX_SESSIONS_PER_DAY = 8
MAX_EVENTS_PER_SESSION = 30  # user actions; exposures do not count, so they cannot shift paths
DAY_MS = 86_400_000

ENTRY_POINTS = ("dashboard", "landing", "trip_list")
EDIT_TYPES = ("reorder", "regenerate_activity", "remove_activity")
OUTCOMES = (("completed", 0.85), ("fallback", 0.10), ("failed", 0.05))
_TRIP_ACTIONS = {"trip_viewed", "itinerary_edited", "trip_saved", "calendar_synced"}


@dataclass(frozen=True)
class SimUser:
    user_id: str
    persona: str
    first_active_date: str
    variant: str | None = None
    bucket: int | None = None
    exposure_logged: bool = True
    first_exposed_at: str | None = None

    def to_dict(self) -> dict:
        return {
            "userId": self.user_id,
            "persona": self.persona,
            "firstActiveDate": self.first_active_date,
            "variant": self.variant,
            "bucket": self.bucket,
            "exposureLogged": self.exposure_logged,
            "firstExposedAt": self.first_exposed_at,
        }


@dataclass(frozen=True)
class Simulation:
    users: tuple[SimUser, ...]
    events: list[dict]  # sorted by occurredAt; no field marks them, ids carry the sim- prefix
    experiment: Experiment | None = None


def _poisson(rng: random.Random, mean: float) -> int:
    limit, k, p = math.exp(-mean), 0, 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return k
        k += 1


def _pick(rng: random.Random, row: Row) -> str:
    """Inverse-CDF draw: always exactly one ``rng.random()``."""
    u = rng.random()
    total = 0.0
    for name, p in row:
        total += p
        if u < total:
            return name
    return next(name for name, p in reversed(row) if p > 0)


class _User:
    """Builds the events of one simulated user, in time order."""

    def __init__(self, seed: int, number: int, origin: datetime, experiment: Experiment | None):
        self.rng = random.Random(f"{seed}:{number}")
        self.number = number
        self.origin = origin
        self.user_id = f"sim-u-{number:06d}"
        self.persona: Persona = self.rng.choices(PERSONAS, weights=[p.weight for p in PERSONAS])[0]
        self.experiment = experiment
        self.bucket: int | None = None
        self.variant: str | None = None
        self.exposure_logged = True
        if experiment is not None:
            self.bucket, self.variant = experiment.assign(self.user_id)
            loss = experiment.exposure_loss.get(self.variant, 0.0)
            # Separate stream: the logging fault must not shift the behaviour draws.
            self.exposure_logged = random.Random(f"{seed}:{number}:exposure").random() >= loss
        self.trips: list[tuple[str, int]] = []  # (tripId, durationDays)
        self.counters = {"session": 0, "job": 0, "trip": 0}
        self.first_exposure_ms: int | None = None
        self.generation_ms = 0  # request -> completion gap of the completion being built
        self.drafts: list[tuple[int, int, int, dict]] = []

    def _next(self, kind: str) -> int:
        self.counters[kind] += 1
        return self.counters[kind]

    def _emit(self, t: int, name: str, session_id: str, props: dict, source: str = "web") -> None:
        event = {
            "schemaVersion": 1,
            "occurredAt": fmt_ts(self.origin + ms(t)),
            "sessionId": session_id,
            "userId": self.user_id,
            "source": source,
            "name": name,
            "properties": props,
        }
        self.drafts.append((t, self.number, len(self.drafts), event))

    def _expose(self, t: int, session_id: str) -> None:
        if self.first_exposure_ms is None:
            self.first_exposure_ms = t
        if self.exposure_logged:
            props = {
                "experimentKey": self.experiment.definition.key,  # type: ignore[union-attr]
                "variant": self.variant,
                "bucket": self.bucket,
            }
            self._emit(t, "experiment_exposure", session_id, props, source="server")

    def _row(self, state: str, t: int, exposed: bool) -> Row:
        row = self.persona.row(state)
        if not exposed:
            return row
        exp = self.experiment
        assert exp is not None and self.variant is not None and self.first_exposure_ms is not None
        lift = exp.lift(self.variant, self.persona.name, (t - self.first_exposure_ms) / DAY_MS)
        return apply_lift(row, exp.target, lift)

    def _session(self, t: int) -> None:
        rng = self.rng
        session_id = f"sim-s-{self.number:06d}-{self._next('session'):04d}"
        state, exposed, emitted = START, False, 0
        current: tuple[str, int] | None = None
        # (jobId, durationDays) awaiting completion; Persona guarantees a completion is only
        # ever drawn right after a request, so it is always set when needed.
        pending: tuple[str, int] | None = None
        while emitted < MAX_EVENTS_PER_SESSION:
            action = _pick(rng, self._row(state, t, exposed))
            if action == END:
                return
            if action in _TRIP_ACTIONS and not self.trips:
                action = "wizard_started"
            if action == COMPLETION:
                self.generation_ms = rng.randint(*GENERATION_MS)
                t += self.generation_ms
            elif state != START:
                t += rng.randint(MIN_EVENT_GAP_MS, MAX_EVENT_GAP_MS)
            if (
                self.experiment is not None
                and not exposed
                and action in self.experiment.exposure_states
            ):
                self._expose(t, session_id)
                exposed = True
            props, current, pending = self._properties(action, current, pending, state)
            self._emit(t, action, session_id, props)
            emitted += 1
            state = action

    def _properties(self, action, current, pending, previous):
        rng = self.rng
        if action == "wizard_started":
            return {"entryPoint": rng.choice(ENTRY_POINTS)}, current, None
        if action == REQUEST:
            job = (f"sim-j-{self.number:06d}-{self._next('job'):04d}", rng.randint(1, 14))
            props = {"jobId": job[0], "durationDays": job[1], "destinationCount": rng.randint(1, 3)}
            return props, current, job
        if action == COMPLETION:
            trip = (f"sim-t-{self.number:06d}-{self._next('trip'):04d}", pending[1])
            self.trips.append(trip)
            outcome = rng.choices([o for o, _ in OUTCOMES], weights=[w for _, w in OUTCOMES])[0]
            props = {
                "jobId": pending[0],
                "tripId": trip[0],
                "outcome": outcome,
                "durationMs": self.generation_ms,
            }
            return props, trip, None
        if current is None or (action == "trip_viewed" and previous in (START, "trip_viewed")):
            current = rng.choice(self.trips)
        props = {"tripId": current[0]}
        if action == "itinerary_edited":
            props.update(editType=rng.choice(EDIT_TYPES), dayIndex=rng.randrange(current[1]))
        elif action == "calendar_synced":
            props["provider"] = "google"
        return props, current, pending

    def run(self, days: int) -> date:
        rng = self.rng
        first_day = rng.randrange(days)
        for day in range(first_day, days):
            count = min(_poisson(rng, self.persona.sessions_per_day), MAX_SESSIONS_PER_DAY)
            if day == first_day:
                count = max(1, count)
            if count == 0:
                continue
            slot = DAY_MS // count
            for j in range(count):
                self._session(day * DAY_MS + j * slot + rng.randrange(slot // 2))
        return (self.origin + timedelta(days=first_day)).date()

    def sim_user(self, first_day: date) -> SimUser:
        first_exposed = None
        if self.first_exposure_ms is not None and self.exposure_logged:
            first_exposed = fmt_ts(self.origin + ms(self.first_exposure_ms))
        return SimUser(
            user_id=self.user_id,
            persona=self.persona.name,
            first_active_date=first_day.isoformat(),
            variant=self.variant,
            bucket=self.bucket,
            exposure_logged=self.exposure_logged,
            first_exposed_at=first_exposed,
        )


def simulate(
    seed: int, users: int, days: int, start: date, experiment: Experiment | None = None
) -> Simulation:
    """Clean simulated events for ``users`` users over ``days`` days from ``start`` (UTC)."""
    check_int("users", users, 0)
    check_int("days", days, 1)
    if not isinstance(start, date):
        raise ValueError(f"start must be a date, got {start!r}")
    origin = datetime(start.year, start.month, start.day, tzinfo=UTC)

    sim_users: list[SimUser] = []
    drafts: list[tuple[int, int, int, dict]] = []
    for number in range(1, users + 1):
        user = _User(seed, number, origin, experiment)
        first_day = user.run(days)
        sim_users.append(user.sim_user(first_day))
        drafts.extend(user.drafts)
    drafts.sort(key=lambda d: d[:3])

    id_rng = random.Random(f"{seed}:event-ids")
    used: set[str] = set()
    events = [{"eventId": new_event_id(id_rng, used), **draft[3]} for draft in drafts]
    return Simulation(tuple(sim_users), events, experiment)
