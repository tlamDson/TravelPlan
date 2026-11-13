"""Truth of a G-sim case: both potential outcomes of the same simulated users.

``observe`` runs the case's experiment twice: once as assigned (this is the data a readout
sees, exactly what ``simkit.simulate`` writes) and once with every user flipped to the other
arm. Each user draws from their own RNG stream and behaves identically until first exposure,
so the flipped run is that user's counterfactual. The true effect in the sample is then
``mean(Y(treatment) − Y(control))`` over the enrolled users: something no estimator sees.

A user is enrolled when their exposure was logged and their whole ``window_days`` after first
exposure fits in the run; metrics count only that window. Sums use ``math.fsum`` so the frozen
numbers do not depend on the platform.
"""

from __future__ import annotations

import math
import random
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, fields
from datetime import UTC, datetime, timedelta
from typing import Any

from simkit._common import fmt_ts, parse_ts
from simkit.experiment import Experiment
from simkit.generator import simulate
from simkit.golden_cases import PERSONA_NAMES, START, SimCase

#: The tolerance on an estimate is this many standard errors of the observed difference.
TOLERANCE_SE = 4.0
VALUE_MU, VALUE_SIGMA = 4.0, 1.5  # lognormal booking value of one save (long-tail cases)
_ORIGIN = datetime(START.year, START.month, START.day, tzinfo=UTC)
_EXACT = {"abs": 0.0, "rel": 0.0}


@dataclass(frozen=True)
class UserOutcome:
    user_id: str
    persona: str
    variant: str  # the arm the user was assigned to
    exposure_day: int  # whole days from the start of the run to the first exposure
    y0: Mapping[str, float]  # metrics in the control arm
    y1: Mapping[str, float]  # metrics in the treatment arm

    @property
    def observed(self) -> Mapping[str, float]:
        return self.y1 if self.variant == "treatment" else self.y0


@dataclass(frozen=True)
class _Flipped(Experiment):
    """The same experiment with every user in the other arm (the counterfactual world)."""

    def assign(self, user_id: str) -> tuple[int, str]:
        bucket, variant = super().assign(user_id)
        return bucket, "control" if variant == "treatment" else "treatment"


def metric_columns(case: SimCase) -> tuple[str, ...]:
    return {
        "saves": ("saves",),
        "ratio": ("saves", "views"),
        "value": ("value",),
        "late": ("saves_early", "saves_late"),
    }[case.metric]


def _by_user(events: Sequence[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for event in events:
        grouped[event["userId"]].append(event)
    return grouped


def _metrics(case: SimCase, seed: int, user_id: str, first: str, events: list[dict]) -> dict:
    start = parse_ts(first)
    half = fmt_ts(start + timedelta(days=case.window_days / 2))
    end = fmt_ts(start + timedelta(days=case.window_days))
    # Same-format UTC timestamps sort as strings.
    inside = [e for e in events if first <= e["occurredAt"] < end]
    saves = [e for e in inside if e["name"] == "trip_saved"]
    if case.metric == "saves":
        return {"saves": len(saves)}
    if case.metric == "ratio":
        return {"saves": len(saves), "views": sum(e["name"] == "trip_viewed" for e in inside)}
    if case.metric == "late":
        early = sum(e["occurredAt"] < half for e in saves)
        return {"saves_early": early, "saves_late": len(saves) - early}
    # The k-th save in the window is worth the same in both arms: one stream per user.
    rng = random.Random(f"{seed}:{user_id}:value")
    amounts = [round(rng.lognormvariate(VALUE_MU, VALUE_SIGMA), 2) for _ in saves]
    return {"value": round(math.fsum(amounts), 2)}


def observe(case: SimCase, seed: int) -> tuple[UserOutcome, ...]:
    """Enrolled users of ``case`` run with ``seed``, with both potential outcomes."""
    experiment = case.experiment()
    actual = simulate(seed, case.users, case.days, START, experiment)
    lossless = {f.name: getattr(experiment, f.name) for f in fields(experiment)}
    flipped_exp = _Flipped(**{**lossless, "exposure_loss": {}})
    flipped = simulate(seed, case.users, case.days, START, flipped_exp)
    actual_events, flipped_events = _by_user(actual.events), _by_user(flipped.events)
    flipped_first = {u.user_id: u.first_exposed_at for u in flipped.users}
    last_day = case.days - case.window_days
    outcomes = []
    for user in actual.users:
        first = user.first_exposed_at
        if first is None:  # never exposed, or the exposure was never logged
            continue
        if flipped_first[user.user_id] != first:
            raise AssertionError(f"{user.user_id}: arms diverged before first exposure")
        exposure_day = (parse_ts(first) - _ORIGIN) // timedelta(days=1)
        if exposure_day >= last_day:
            continue
        own = _metrics(case, seed, user.user_id, first, actual_events[user.user_id])
        other = _metrics(case, seed, user.user_id, first, flipped_events[user.user_id])
        y1, y0 = (own, other) if user.variant == "treatment" else (other, own)
        outcomes.append(UserOutcome(user.user_id, user.persona, user.variant, exposure_day, y0, y1))
    return tuple(outcomes)


def data_columns(case: SimCase, users: Sequence[UserOutcome]) -> dict[str, list[Any]]:
    """The observed table a readout gets: one row per enrolled user, observed arm only."""
    columns: dict[str, list[Any]] = {
        "variant": [u.variant for u in users],
        "persona": [u.persona for u in users],
    }
    if case.peeking:
        columns["exposure_day"] = [u.exposure_day for u in users]
    for name in metric_columns(case):
        columns[name] = [u.observed[name] for u in users]
    return columns


def _mean(values: Sequence[float]) -> float:
    return math.fsum(values) / len(values)


def _var(values: Sequence[float]) -> float:
    m = _mean(values)
    return math.fsum((v - m) ** 2 for v in values) / (len(values) - 1)


def _cov(xs: Sequence[float], ys: Sequence[float]) -> float:
    mx, my = _mean(xs), _mean(ys)
    return math.fsum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / (len(xs) - 1)


def _ratio_var(num: Sequence[float], den: Sequence[float]) -> float:
    """Delta-method variance of sum(num) / sum(den) for one arm of i.i.d. users."""
    md = _mean(den)
    r = math.fsum(num) / math.fsum(den)
    inner = _var(num) - 2 * r * _cov(num, den) + r * r * _var(den)
    return inner / (len(num) * md * md)


def _effect(spec: Mapping[str, str], users: Sequence[UserOutcome]) -> tuple[float, float]:
    """(true effect over ``users``, standard error of the observed difference)."""
    arms = {v: [u.observed for u in users if u.variant == v] for v in ("control", "treatment")}
    if spec["kind"] == "ratio":
        n, d = spec["numerator"], spec["denominator"]
        r1 = math.fsum(u.y1[n] for u in users) / math.fsum(u.y1[d] for u in users)
        r0 = math.fsum(u.y0[n] for u in users) / math.fsum(u.y0[d] for u in users)
        var = sum(_ratio_var([o[n] for o in a], [o[d] for o in a]) for a in arms.values())
        return r1 - r0, math.sqrt(var)
    col = spec["column"]
    effect = _mean([u.y1[col] - u.y0[col] for u in users])
    var = sum(_var([o[col] for o in a]) / len(a) for a in arms.values())
    return effect, math.sqrt(var)


def _round_sig(x: float, digits: int = 6) -> float:
    return float(f"{x:.{digits - 1}e}")


def truth(case: SimCase, users: Sequence[UserOutcome]) -> tuple[dict, dict]:
    """``expected`` and ``tolerance`` of the case's ``truth.json``."""
    if case.exposure_loss > 0:
        return {"srm": True}, {"default": dict(_EXACT)}
    expected: dict[str, Any] = {"srm": False}
    tolerance: dict[str, Any] = {"default": dict(_EXACT)}

    def put(key: str, spec: Mapping[str, str], subset: Sequence[UserOutcome]) -> None:
        effect, se = _effect(spec, subset)
        expected[key] = effect
        tolerance[key] = {"abs": _round_sig(TOLERANCE_SE * se), "rel": 0.0}

    params = case.params()
    put("estimate", params["metric"], users)
    if "early_metric" in params:
        put("early_estimate", params["early_metric"], users)
    if case.by_persona:
        for persona in PERSONA_NAMES:
            put(f"estimate_{persona}", params["metric"], [u for u in users if u.persona == persona])
    return expected, tolerance
