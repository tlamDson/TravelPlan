"""The G-sim cases (B2 plan, PR 13a): planted parameters, and the right decision they imply.

Each case is a SIMULATED two-arm experiment (virtual users, 50/50) on ``trip_saved``. The right
decision comes from the planted parameters alone, never from a test on the data:

- any ``exposureLoss`` → ``invalid`` (sample-ratio mismatch: the readout must not conclude);
- else a lasting lift > 0 for some persona → ``ship``; < 0 → ``no_ship`` (harm);
  none (A/A, or a novelty boost that fades) → ``no_ship``.

``simkit.freeze_golden`` turns this table into ``analytics/golden/v1/sim-*``. Changing a case
here means a new dataset version (v2), not an edit of v1.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from abkit.assignment import parse_definition

from simkit.experiment import Experiment
from simkit.personas import PERSONAS

START = date(2026, 11, 1)
PERSONA_NAMES = tuple(p.name for p in PERSONAS)
METRICS = ("saves", "ratio", "value", "late")
ALPHA = 0.05
SRM_THRESHOLD = 0.0005
_DECISIONS = {"ship": "ship", "harm": "no_ship", "flat": "no_ship", "invalid": "invalid"}


@dataclass(frozen=True)
class SimCase:
    group: str
    name: str
    description: str
    first_seed: int
    users: int = 6000
    days: int = 14
    window_days: int = 7  # each enrolled user is measured for this long after first exposure
    lift: Mapping[str, float] = field(default_factory=dict)  # treatment relativeLift by persona
    novelty: float = 0.0  # treatment noveltyLift, halving every half_life_days
    half_life_days: float = 2.0
    exposure_loss: float = 0.0  # share of treatment users whose exposure is never logged
    metric: str = "saves"
    by_persona: bool = False
    peeking: bool = False
    ci_fast: bool = False

    def __post_init__(self) -> None:
        if self.metric not in METRICS:
            raise ValueError(f"{self.id}: metric must be one of {METRICS}")
        if self.window_days >= self.days:
            raise ValueError(f"{self.id}: window_days must be shorter than days")
        if self.metric == "late" and self.window_days % 2:
            raise ValueError(f"{self.id}: a novelty window splits in two halves, use an even one")
        signs = {v > 0 for v in self.lift.values() if v != 0}
        if len(signs) > 1:
            raise ValueError(f"{self.id}: mixed lift signs have no single right decision")
        self.experiment()  # validates personas and ranges

    @property
    def id(self) -> str:
        return f"{self.group}/{self.name}"

    @property
    def verdict(self) -> str:
        """``ship`` / ``harm`` / ``flat`` / ``invalid``, from the planted parameters only."""
        if self.exposure_loss > 0:
            return "invalid"
        if any(v > 0 for v in self.lift.values()):
            return "ship"
        if any(v < 0 for v in self.lift.values()):
            return "harm"
        return "flat"

    @property
    def decision(self) -> str:
        return _DECISIONS[self.verdict]

    def experiment(self) -> Experiment:
        key = f"golden-{self.group}-{self.name}"
        definition = parse_definition(
            {
                "key": key,
                "salt": "golden",
                "holdoutBuckets": 0,
                "variants": [
                    {"key": "control", "weight": 5000},
                    {"key": "treatment", "weight": 5000},
                ],
            }
        )
        return Experiment(
            definition=definition,
            relative_lift={"treatment": dict(self.lift)} if self.lift else {},
            novelty_lift={"treatment": self.novelty} if self.novelty else {},
            novelty_half_life_days=self.half_life_days,
            exposure_loss={"treatment": self.exposure_loss} if self.exposure_loss else {},
        )

    def metric_spec(self) -> dict[str, str]:
        if self.metric == "ratio":
            return {"kind": "ratio", "numerator": "saves", "denominator": "views"}
        column = {"saves": "saves", "value": "value", "late": "saves_late"}[self.metric]
        return {"kind": "mean", "column": column}

    def params(self) -> dict[str, Any]:
        """What the ``readout`` method receives (``analytics/golden/README.md``)."""
        params: dict[str, Any] = {
            "alpha": ALPHA,
            "srm_threshold": SRM_THRESHOLD,
            "expected_shares": {"control": 0.5, "treatment": 0.5},
            "metric": self.metric_spec(),
        }
        if self.metric == "late":
            params["early_metric"] = {"kind": "mean", "column": "saves_early"}
        if self.by_persona:
            params["by_persona"] = True
        if self.peeking:
            params["window_days"] = self.window_days
            params["looks"] = self.looks
        return params

    @property
    def looks(self) -> list[int]:
        """Interim days someone peeked at (the planned horizon, ``days``, is not one)."""
        return list(range(self.window_days + 1, self.days)) if self.peeking else []


def _uniform(lift: float) -> dict[str, float]:
    return dict.fromkeys(PERSONA_NAMES, lift)


def _cases() -> list[SimCase]:
    cases: list[SimCase] = []

    def add(group: str, name: str, description: str, **kw: Any) -> None:
        cases.append(SimCase(group, name, description, first_seed=1000 * (len(cases) + 1), **kw))

    for i in range(1, 11):
        add("sim-aa", f"aa-{i:02d}", "A/A: no planted effect on saves.", ci_fast=i == 1)

    for lift in (0.4, 0.5, 0.6, 0.8, 1.0):
        pct = round(lift * 100)
        add(
            "sim-effect",
            f"uniform-{pct}",
            f"+{pct}% on the save transition for every persona.",
            lift=_uniform(lift),
            users=10000 if lift < 0.5 else 6000,
            ci_fast=lift == 0.6,
        )
    for lift in (0.6, 0.8):
        pct = round(lift * 100)
        add(
            "sim-effect",
            f"uniform-{pct}-long",
            f"+{pct}% for every persona over a 21-day run.",
            lift=_uniform(lift),
            days=21,
        )
    for persona, lift, users in (
        ("planner", 1.5, 10000),
        ("power", 0.8, 10000),
        ("power", 1.2, 6000),
    ):
        pct = round(lift * 100)
        add(
            "sim-effect",
            f"{persona}-only-{pct}",
            f"+{pct}% for {persona} users only; the other personas are unaffected.",
            lift={persona: lift},
            by_persona=True,
            users=users,
        )
    add(
        "sim-effect",
        "planner-power-60",
        "+60% for planner and power users, browsers unaffected.",
        lift={"planner": 0.6, "power": 0.6},
        by_persona=True,
    )
    add(
        "sim-effect",
        "graded-by-persona",
        "Graded lift: +20% browser, +50% planner, +90% power.",
        lift={"browser": 0.2, "planner": 0.5, "power": 0.9},
        by_persona=True,
    )
    for lift in (-0.3, -0.4, -0.5):
        pct = round(-lift * 100)
        add(
            "sim-effect",
            f"harm-{pct}",
            f"-{pct}% on the save transition for every persona: a harmful change.",
            lift=_uniform(lift),
        )

    srm = ((0.15, 0.0), (0.2, 0.0), (0.3, 0.0), (0.2, 0.6), (0.25, 0.8))  # (loss, lift)
    for i, (loss, lift) in enumerate(srm):
        kind = "A/A" if not lift else f"+{round(lift * 100)}% lift"
        add(
            "sim-srm",
            f"loss-{round(loss * 100)}-{'aa' if not lift else 'lift'}",
            f"{kind}, but {round(loss * 100)}% of treatment exposures are never logged.",
            lift=_uniform(lift) if lift else {},
            exposure_loss=loss,
            ci_fast=i == 0,
        )

    novelty = ((1.5, 0.0), (2.0, 0.0), (2.5, 0.0), (1.5, 0.8), (2.0, 1.0))  # (novelty, lift)
    for i, (boost, lift) in enumerate(novelty):
        lasting = "no lasting effect" if not lift else f"a lasting +{round(lift * 100)}%"
        add(
            "sim-novelty",
            f"novelty-{round(boost * 100)}-{'fades' if not lift else 'lasting'}",
            f"Novelty boost of +{round(boost * 100)}% (half-life 1 day) with {lasting}; "
            "decide on days 7-14 after exposure.",
            lift=_uniform(lift) if lift else {},
            novelty=boost,
            half_life_days=1.0,
            metric="late",
            window_days=14,
            days=21,
            users=9000,
            ci_fast=i == 0,
        )

    for i, lift in enumerate((0.0, 0.0, 0.15, 0.25, 0.4)):
        name = f"aa-{i + 1:02d}" if not lift else f"lift-{round(lift * 100)}"
        kind = "A/A" if not lift else f"+{round(lift * 100)}% on the save transition"
        add(
            "sim-ratio",
            name,
            f"Ratio metric saves per trip view (delta method); {kind}.",
            lift=_uniform(lift) if lift else {},
            metric="ratio",
            ci_fast=i == 2,
        )

    for i in range(1, 6):
        add(
            "sim-peeking",
            f"peek-trap-{i:02d}",
            "A/A where a naive daily Welch test would have shipped at an interim look; "
            "decide once, at the planned horizon.",
            peeking=True,
            ci_fast=i == 1,
        )

    for i, lift in enumerate((0.0, 0.0, 0.8, 1.0, 1.2)):
        name = f"aa-{i + 1:02d}" if not lift else f"lift-{round(lift * 100)}"
        kind = "A/A" if not lift else f"+{round(lift * 100)}% on the save transition"
        add(
            "sim-long-tail",
            name,
            f"Long-tailed booking value per user (lognormal per save, sigma 1.5); {kind}.",
            lift=_uniform(lift) if lift else {},
            metric="value",
            ci_fast=i == 3,
        )
    return cases


SIM_CASES: tuple[SimCase, ...] = tuple(_cases())
GROUP_SIZES: dict[str, int] = dict(Counter(c.group for c in SIM_CASES))
