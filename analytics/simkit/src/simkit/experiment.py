"""Experiment hook: server-side assignment, one exposure per session, and a known injected effect.

Users are bucketed with ``abkit.assignment`` (the Python twin of the server), so a simulated
user lands in the variant the app would give them. In each session the first entry into an
``exposure_states`` page logs one ``experiment_exposure`` (the server writes it when the variant
renders). From then on, every transition into ``target`` has its probability multiplied by
``1 + lift(variant, persona, days since the user's first exposure)``; the rest of the row is
rescaled so it still sums to 1. ``lift`` is ``relative_lift`` plus a novelty term that halves
every ``novelty_half_life_days``.

``exposure_loss`` is a logging fault (sample-ratio mismatch): that share of a variant's users
never has an exposure logged, while their behaviour (effect included) stays the same.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from abkit.assignment import HOLDOUT_VARIANT, ExperimentDefinition, assign_variant, parse_definition

from simkit.personas import ACTIONS, COMPLETION, PERSONAS, Row

DEFAULT_EXPOSURE_STATES = (COMPLETION, "trip_viewed")
_FIELDS = {
    "definition",
    "target",
    "relativeLift",
    "noveltyLift",
    "noveltyHalfLifeDays",
    "exposureStates",
    "exposureLoss",
}
_PERSONA_NAMES = {p.name for p in PERSONAS}


@dataclass(frozen=True)
class Experiment:
    definition: ExperimentDefinition
    target: str = "trip_saved"
    relative_lift: Mapping[str, Mapping[str, float]] = field(default_factory=dict)
    novelty_lift: Mapping[str, float] = field(default_factory=dict)
    novelty_half_life_days: float = 7.0
    exposure_states: tuple[str, ...] = DEFAULT_EXPOSURE_STATES
    exposure_loss: Mapping[str, float] = field(default_factory=dict)

    def __post_init__(self) -> None:
        variants = set(self.variants)
        if self.target not in ACTIONS or self.target == COMPLETION:
            raise ValueError(f"target must be a user action other than {COMPLETION}")
        for state in self.exposure_states:
            if state not in ACTIONS:
                raise ValueError(f"unknown exposure state {state!r}")
        for name, mapping in (
            ("relativeLift", self.relative_lift),
            ("noveltyLift", self.novelty_lift),
            ("exposureLoss", self.exposure_loss),
        ):
            unknown = set(mapping) - variants
            if unknown:
                raise ValueError(f"{name}: unknown variant {sorted(unknown)}")
        for variant, by_persona in self.relative_lift.items():
            unknown = set(by_persona) - _PERSONA_NAMES
            if unknown:
                raise ValueError(f"relativeLift.{variant}: unknown persona {sorted(unknown)}")
            for lift in by_persona.values():
                _check_lift(lift)
        for lift in self.novelty_lift.values():
            _check_lift(lift)
        if not self.novelty_half_life_days > 0:
            raise ValueError("novelty half-life must be > 0 days")
        for rate in self.exposure_loss.values():
            if not 0.0 <= rate <= 1.0:
                raise ValueError(f"exposureLoss rates must be in [0, 1], got {rate!r}")

    @property
    def variants(self) -> tuple[str, ...]:
        keys = tuple(v.key for v in self.definition.variants)
        return (HOLDOUT_VARIANT, *keys) if self.definition.holdout_buckets else keys

    def assign(self, user_id: str) -> tuple[int, str]:
        return assign_variant(self.definition, user_id)

    def lift(self, variant: str, persona: str, days_since_exposure: float) -> float:
        base = self.relative_lift.get(variant, {}).get(persona, 0.0)
        novelty = self.novelty_lift.get(variant, 0.0)
        if novelty:
            novelty *= 0.5 ** (days_since_exposure / self.novelty_half_life_days)
        return base + novelty

    def to_dict(self) -> dict[str, Any]:
        d = self.definition
        return {
            "definition": {
                "key": d.key,
                "salt": d.salt,
                "holdoutBuckets": d.holdout_buckets,
                "variants": [{"key": v.key, "weight": v.weight} for v in d.variants],
            },
            "target": self.target,
            "relativeLift": {k: dict(v) for k, v in self.relative_lift.items()},
            "noveltyLift": dict(self.novelty_lift),
            "noveltyHalfLifeDays": self.novelty_half_life_days,
            "exposureStates": list(self.exposure_states),
            "exposureLoss": dict(self.exposure_loss),
        }


def _check_lift(lift: object) -> None:
    if isinstance(lift, bool) or not isinstance(lift, int | float) or lift <= -1:
        raise ValueError(f"lift must be a number > -1, got {lift!r}")


def parse_experiment(raw: Mapping[str, Any]) -> Experiment:
    """Build an ``Experiment`` from camelCase JSON (the CLI's ``--experiment`` file)."""
    unknown = set(raw) - _FIELDS
    if unknown:
        raise ValueError(f"unknown experiment config fields: {sorted(unknown)}")
    if "definition" not in raw:
        raise ValueError("experiment config needs a definition")
    return Experiment(
        definition=parse_definition(raw["definition"]),
        target=raw.get("target", "trip_saved"),
        relative_lift={k: dict(v) for k, v in raw.get("relativeLift", {}).items()},
        novelty_lift=dict(raw.get("noveltyLift", {})),
        novelty_half_life_days=raw.get("noveltyHalfLifeDays", 7.0),
        exposure_states=tuple(raw.get("exposureStates", DEFAULT_EXPOSURE_STATES)),
        exposure_loss=dict(raw.get("exposureLoss", {})),
    )


def apply_lift(row: Row, target: str, lift: float) -> Row:
    """Multiply P(target) by ``1 + lift`` (capped at 1) and rescale the other destinations."""
    probs = dict(row)
    p = probs.get(target, 0.0)
    if lift == 0 or p == 0:
        return row
    new_p = min(1.0, p * (1.0 + lift))
    rest = 1.0 - p
    scale = (1.0 - new_p) / rest if rest > 0 else 0.0
    return tuple((name, new_p if name == target else q * scale) for name, q in row)
