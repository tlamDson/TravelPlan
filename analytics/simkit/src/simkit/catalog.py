"""The analytics event catalog and the G-event ingest rules, replayed in Python.

The catalog is the JSON Schema exported from ``packages/shared`` (never a copy). ``classify``
labels a bad event the way ``backend/src/features/analytics/services/quarantine-reason.ts``
does, and ``replay_ingest`` applies the schema rules of ``ingestTrustedEvents`` (the answer key
is ``packages/shared/fixtures/golden-events/ingest-batch/truth.json``):

- each event is validated on its own; a bad one is quarantined and never deduplicated;
- a valid event whose ``eventId`` was accepted earlier in the stream is a duplicate.

The HTTP-only client policy (``source: "server"`` refused, ``user_mismatch``) is not replayed:
simulated exposure events are written by the server, as in the app.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

SCHEMA_PATH = (
    Path(__file__).resolve().parents[4] / "packages/shared/json-schema/analytics-event.schema.json"
)
# Same order as QUARANTINE_REASONS in the backend: when an event has several issues, the
# earliest reason here labels it.
QUARANTINE_REASONS = (
    "unknown_event",
    "wrong_source",
    "missing_field",
    "unknown_field",
    "wrong_type",
)


@dataclass(frozen=True)
class Issue:
    path: str  # dotted path into the event, "" for the event itself
    code: str  # the JSON Schema keyword that failed
    reason: str


@dataclass(frozen=True)
class Violation:
    reason: str
    issue_path: str  # path of the first issue that carries ``reason``
    issues: tuple[Issue, ...]


@dataclass(frozen=True)
class EventOutcome:
    outcome: str  # "accepted" | "duplicate" | "quarantined"
    reason: str | None = None
    issue_path: str | None = None


@dataclass(frozen=True)
class IngestReplay:
    outcomes: tuple[EventOutcome, ...]

    def counts(self) -> dict[str, int]:
        tally = {"accepted": 0, "duplicate": 0, "quarantined": 0}
        for o in self.outcomes:
            tally[o.outcome] += 1
        return {
            "received": len(self.outcomes),
            "accepted": tally["accepted"],
            "duplicates": tally["duplicate"],
            "quarantined": tally["quarantined"],
        }


def _reason(path: tuple[Any, ...], code: str) -> str:
    if path == ("source",):
        return "wrong_source"
    if code == "required":
        return "missing_field"
    if code == "additionalProperties":
        return "unknown_field"
    return "wrong_type"


def _dotted(path: Iterable[Any]) -> str:
    return ".".join(str(p) for p in path)


class Catalog:
    """One validator per event name, built from the exported ``oneOf`` schema."""

    def __init__(self, schema: Mapping[str, Any]) -> None:
        validators = {}
        for branch in schema["oneOf"]:
            name = branch["properties"]["name"]["const"]
            validators[name] = Draft202012Validator(branch)
        self._validators = validators
        self.names = tuple(validators)

    def _issues(self, event: Mapping[str, Any]) -> list[Issue]:
        issues = []
        for error in self._validators[event["name"]].iter_errors(event):
            path = tuple(error.absolute_path)
            if error.validator == "required":
                missing = [k for k in error.validator_value if k not in error.instance]
                for key in missing:
                    full = (*path, key)
                    issues.append(Issue(_dotted(full), "required", _reason(full, "required")))
            else:
                code = str(error.validator)
                issues.append(Issue(_dotted(path), code, _reason(path, code)))
        return issues

    def classify(self, event: object) -> Violation | None:
        """``None`` when ``event`` is a valid catalog event, else why it is quarantined."""
        if not isinstance(event, Mapping):
            issue = Issue("", "type", "wrong_type")
            return Violation(issue.reason, issue.path, (issue,))
        name = event.get("name")
        if not isinstance(name, str) or name not in self._validators:
            issue = Issue("name", "const", "unknown_event")
            return Violation(issue.reason, issue.path, (issue,))
        issues = self._issues(event)
        if not issues:
            return None
        reason = next(r for r in QUARANTINE_REASONS if any(i.reason == r for i in issues))
        first = next(i for i in issues if i.reason == reason)
        return Violation(reason, first.path, tuple(issues))


@lru_cache(maxsize=4)
def _load(path: Path) -> Catalog:
    return Catalog(json.loads(path.read_text(encoding="utf-8")))


def load_catalog(path: Path = SCHEMA_PATH) -> Catalog:
    return _load(Path(path).resolve())


def replay_ingest(events: Sequence[object], catalog: Catalog | None = None) -> IngestReplay:
    """Outcome of every event under the G-event ingest rules, in stream order."""
    catalog = catalog or load_catalog()
    seen: set[str] = set()
    outcomes = []
    for event in events:
        violation = catalog.classify(event)
        if violation is not None:
            outcomes.append(EventOutcome("quarantined", violation.reason, violation.issue_path))
            continue
        event_id = event["eventId"]  # type: ignore[index]
        outcomes.append(EventOutcome("duplicate" if event_id in seen else "accepted"))
        seen.add(event_id)
    return IngestReplay(tuple(outcomes))
