"""Plant known faults in clean SIMULATED events and return the answer key.

Ported from RepoPulse ``simkit/faults.py`` and narrowed to the G-event ingest outcomes
(``packages/shared/fixtures/golden-events/ingest-batch/truth.json``). One fault is:

- ``duplicate``: one exact copy (same ``eventId``) of an event, placed after the original
  (at most ``DUPLICATE_MAX_DISTANCE`` input events later) -> counted as a duplicate.
- ``missing_field``: one envelope field or property removed -> quarantined ``missing_field``.
- ``wrong_type``: one envelope field or property set to a value of another JSON type
  -> quarantined ``wrong_type``.
- ``unknown_field``: one extra field in the envelope or in ``properties``
  -> quarantined ``unknown_field``.
- ``unknown_event``: ``name`` set to a name outside the catalog -> quarantined ``unknown_event``.
- ``wrong_source``: an ``experiment_exposure`` claiming ``source: "web"``
  -> quarantined ``wrong_source``.

``name`` and ``source`` are never touched by the field faults, so each fault maps to exactly one
outcome. Faults never overlap, and the input must be clean (every event accepted), so the
expected ingest counts follow from the fault list alone, without running the validator.
"""

from __future__ import annotations

import copy
import random
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from simkit.catalog import Catalog, load_catalog, replay_ingest

FAULT_TYPES = (
    "duplicate",
    "missing_field",
    "wrong_type",
    "unknown_field",
    "unknown_event",
    "wrong_source",
)
EXPECTED = {
    "duplicate": ("duplicate", None),
    **{f: ("quarantined", f) for f in FAULT_TYPES[1:]},
}
DUPLICATE_MAX_DISTANCE = 20
UNKNOWN_NAMES = ("trip_deleted", "trip_exported", "wizard_abandoned")
DRIFT_FIELDS = {
    "abBucket": ("control", "variant_a"),
    "referrer": ("https://www.example.com/blog", "https://www.example.org/deals"),
    "utmSource": ("newsletter", "partner", "ads"),
}
_UNTOUCHED = frozenset({"name", "source", "properties"})


@dataclass(frozen=True)
class FaultRecord:
    fault: str
    index: int  # position in the faulted output (the copy, for a duplicate)
    event_id: str  # the event's id before the fault
    detail: dict

    @property
    def expected_outcome(self) -> str:
        return EXPECTED[self.fault][0]

    @property
    def expected_reason(self) -> str | None:
        return EXPECTED[self.fault][1]

    def to_dict(self) -> dict:
        return {
            "fault": self.fault,
            "index": self.index,
            "eventId": self.event_id,
            "expectedOutcome": self.expected_outcome,
            "expectedReason": self.expected_reason,
            "detail": self.detail,
        }


@dataclass(frozen=True)
class FaultResult:
    events: list[dict]
    faults: tuple[FaultRecord, ...]

    def counts(self) -> dict[str, int]:
        counts = dict.fromkeys(FAULT_TYPES, 0)
        for record in self.faults:
            counts[record.fault] += 1
        return counts

    def expected_ingest(self) -> dict[str, int]:
        counts = self.counts()
        duplicates = counts["duplicate"]
        quarantined = sum(counts.values()) - duplicates
        received = len(self.events)
        return {
            "received": received,
            "accepted": received - duplicates - quarantined,
            "duplicates": duplicates,
            "quarantined": quarantined,
        }

    def manifest(self) -> dict:
        return {
            "simulated": True,
            "counts": self.counts(),
            "expectedIngest": self.expected_ingest(),
            "faults": [r.to_dict() for r in self.faults],
        }


def _check_counts(counts: Mapping[str, int]) -> dict[str, int]:
    requested = dict.fromkeys(FAULT_TYPES, 0)
    for key in sorted(counts, key=str):
        if key not in requested:
            raise ValueError(f"unknown fault type {key!r} (known: {', '.join(FAULT_TYPES)})")
        value = counts[key]
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError(f"count for {key!r} must be a non-negative integer, got {value!r}")
        requested[key] = value
    return requested


def _leaves(event: Mapping) -> list[str]:
    """Dotted paths a field fault may touch: envelope fields and properties."""
    envelope = [k for k in event if k not in _UNTOUCHED]
    return sorted(envelope) + sorted(f"properties.{k}" for k in event["properties"])


def _split(event: dict, path: str) -> tuple[dict, str]:
    if path.startswith("properties."):
        return event["properties"], path.removeprefix("properties.")
    return event, path


def _other_type(rng: random.Random, value: object) -> object:
    if isinstance(value, int | float):
        return str(value)
    return rng.randint(1, 99_999)  # string or null -> integer


class _Injector:
    def __init__(self, events: Sequence[Mapping], rng: random.Random) -> None:
        self.rng = rng
        self.source = [copy.deepcopy(dict(e)) for e in events]
        self.ids = [e["eventId"] for e in self.source]
        self.details: dict[int, tuple[str, dict]] = {}
        self.copies: list[tuple[int, int]] = []  # (anchor, original index)

    def apply(self, fault: str, i: int) -> None:
        if fault == "duplicate":
            last = min(len(self.source) - 1, i + DUPLICATE_MAX_DISTANCE)
            self.copies.append((self.rng.randint(i, last), i))
            return
        self.details[i] = (fault, getattr(self, fault)(self.source[i]))

    def missing_field(self, event: dict) -> dict:
        path = self.rng.choice([*_leaves(event), "properties"])
        target, key = _split(event, path)
        del target[key]
        return {"field": path}

    def wrong_type(self, event: dict) -> dict:
        path = self.rng.choice(_leaves(event))
        target, key = _split(event, path)
        target[key] = _other_type(self.rng, target[key])
        return {"field": path, "value": target[key]}

    def unknown_field(self, event: dict) -> dict:
        key = self.rng.choice(sorted(DRIFT_FIELDS))
        value = self.rng.choice(DRIFT_FIELDS[key])
        in_properties = self.rng.random() < 0.5
        (event["properties"] if in_properties else event)[key] = value
        return {"field": f"properties.{key}" if in_properties else key, "value": value}

    def unknown_event(self, event: dict) -> dict:
        event["name"] = self.rng.choice(UNKNOWN_NAMES)
        return {"field": "name", "value": event["name"]}

    def wrong_source(self, event: dict) -> dict:
        event["source"] = "web"
        return {"field": "source", "value": "web"}

    def result(self) -> FaultResult:
        items = [((i, 0, 0), i, False) for i in range(len(self.source))]
        items += [((anchor, 1, n), i, True) for n, (anchor, i) in enumerate(self.copies)]
        items.sort(key=lambda item: item[0])
        position = {i: pos for pos, (_, i, is_copy) in enumerate(items) if not is_copy}
        events, records = [], []
        for pos, (_, i, is_copy) in enumerate(items):
            event = self.source[i]
            events.append(copy.deepcopy(event) if is_copy else event)
            if is_copy:
                detail = {"originalIndex": position[i]}
                records.append(FaultRecord("duplicate", pos, self.ids[i], detail))
            elif i in self.details:
                fault, detail = self.details[i]
                records.append(FaultRecord(fault, pos, self.ids[i], detail))
        return FaultResult(events, tuple(records))


def inject_faults(
    events: Sequence[Mapping],
    counts: Mapping[str, int],
    seed: int,
    catalog: Catalog | None = None,
) -> FaultResult:
    """Faulted copy of ``events`` (not modified) plus one record per planted fault."""
    requested = _check_counts(counts)
    catalog = catalog or load_catalog()
    replay = replay_ingest(events, catalog)
    if any(o.outcome != "accepted" for o in replay.outcomes):
        raise ValueError(
            "inject_faults needs clean input: every event accepted by replay_ingest "
            f"(got {replay.counts()})"
        )
    rng = random.Random(seed)
    injector = _Injector(events, rng)
    exposures = [i for i, e in enumerate(events) if e["name"] == "experiment_exposure"]
    if requested["wrong_source"] > len(exposures):
        raise ValueError(
            f"wrong_source needs experiment_exposure events: asked for "
            f"{requested['wrong_source']}, the input has {len(exposures)}"
        )
    targets = rng.sample(exposures, requested["wrong_source"])
    taken = set(targets)
    remaining = [i for i in range(len(events)) if i not in taken]
    others = sum(requested.values()) - requested["wrong_source"]
    if others > len(remaining):
        raise ValueError(
            f"asked for {others} faults besides wrong_source, only {len(remaining)} "
            "eligible events are left"
        )
    picks = iter(rng.sample(remaining, others))
    for fault in FAULT_TYPES:
        for _ in range(requested[fault]):
            injector.apply(fault, targets.pop() if fault == "wrong_source" else next(picks))
    return injector.result()
