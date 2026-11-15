"""Prepare a load run (simulate, plant faults, plan) and check abkit end to end on its export."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import numpy as np
from abkit.readout.analysis import Readout, run_readout

from simkit._common import parse_ts
from simkit.catalog import replay_ingest
from simkit.driver.enrollment import enrollment_table, readout_params
from simkit.driver.plan import UserScript, build_plan
from simkit.experiment import Experiment, parse_experiment
from simkit.faults import inject_faults
from simkit.generator import simulate

#: save-trip-cta-v1 (B2 plan PR 8) with +3% / +6% on two personas (simkit README).
DEFAULT_EXPERIMENT: dict[str, Any] = {
    "definition": {
        "key": "save-trip-cta-v1",
        "salt": "sim",
        "holdoutBuckets": 0,
        "variants": [
            {"key": "control", "weight": 5000},
            {"key": "treatment", "weight": 5000},
        ],
    },
    "target": "trip_saved",
    "relativeLift": {"treatment": {"planner": 0.03, "power": 0.06}},
    "noveltyLift": {},
    "noveltyHalfLifeDays": 7,
    "exposureLoss": {},
}


@dataclass(frozen=True)
class Prepared:
    users: int
    days: int
    seed: int
    start: date
    window_days: int
    experiment_raw: Mapping[str, Any]
    experiment: Experiment
    events: list  # what is sent: simulated events with the planted faults
    expected: dict[str, int]  # the fault manifest's ingest counts
    scripts: list[UserScript]
    accepted_events: list[dict]  # what the G-event rules accept, in stream order

    @property
    def sent(self) -> int:
        return len(self.events)

    @property
    def accepted_ids(self) -> list[str]:
        return [e["eventId"] for e in self.accepted_events]


def prepare(
    *,
    users: int,
    days: int,
    seed: int,
    start: date,
    experiment: Mapping[str, Any],
    faults: Mapping[str, int],
    window_days: int = 7,
) -> Prepared:
    parsed = parse_experiment(experiment)
    sim = simulate(seed=seed, users=users, days=days, start=start, experiment=parsed)
    faulted = inject_faults(sim.events, faults, seed=seed)
    replay = replay_ingest(faulted.events)
    accepted = [
        e for e, o in zip(faulted.events, replay.outcomes, strict=True) if o.outcome == "accepted"
    ]
    if replay.counts() != faulted.expected_ingest():
        raise AssertionError("planted faults do not reproduce the expected ingest counts")
    return Prepared(
        users=users,
        days=days,
        seed=seed,
        start=start,
        window_days=window_days,
        experiment_raw=experiment,
        experiment=parsed,
        events=faulted.events,
        expected=faulted.expected_ingest(),
        scripts=build_plan(faulted.events),
        accepted_events=accepted,
    )


def export_days(events: Sequence[Mapping[str, Any]]) -> list[str]:
    """Every UTC day from the first to the last event (the export writes one file per day)."""
    if not events:
        return []
    moments = [parse_ts(e["occurredAt"]) for e in events]
    first, last = min(moments).date(), max(moments).date()
    return [(first + timedelta(days=i)).isoformat() for i in range((last - first).days + 1)]


@dataclass(frozen=True)
class EndToEnd:
    direct: Readout  # abkit on the simulated events the ingest should accept
    exported: Readout  # abkit on what came back out of Mongo through the export
    same_table: bool
    n_users: int

    @property
    def estimate_abs_diff(self) -> float:
        return abs(self.exported.primary.estimate - self.direct.primary.estimate)


def _table(prepared: Prepared, events: Sequence[Mapping[str, Any]]) -> dict[str, np.ndarray]:
    raw = enrollment_table(
        events,
        prepared.experiment.definition.key,
        start=prepared.start,
        days=prepared.days,
        window_days=prepared.window_days,
    )
    # Row order differs (raw vs hashed ids); sort so equal tables give bit-equal readouts.
    rows = sorted(zip(raw["variant"], raw["saves"], strict=True))
    return {
        "variant": np.array([v for v, _ in rows], dtype=str),
        "saves": np.array([s for _, s in rows], dtype=np.float64),
    }


def analyze(prepared: Prepared, exported_rows: Sequence[Mapping[str, Any]]) -> EndToEnd:
    params = readout_params(prepared.experiment_raw["definition"])
    direct = _table(prepared, prepared.accepted_events)
    exported = _table(prepared, exported_rows)
    same = all(np.array_equal(direct[k], exported[k]) for k in direct)
    return EndToEnd(
        direct=run_readout(direct, params),
        exported=run_readout(exported, params),
        same_table=same,
        n_users=int(exported["variant"].size),
    )
