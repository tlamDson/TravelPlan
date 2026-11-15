"""Readout parameters: the ``readout`` params of ``analytics/golden/README.md``, validated."""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from abkit.stats import SRM_THRESHOLD
from abkit.stats._common import check_alpha

_KEYS = {
    "alpha",
    "srm_threshold",
    "expected_shares",
    "metric",
    "early_metric",
    "by_persona",
    "looks",
    "window_days",
}
_ARMS = ("control", "treatment")


@dataclass(frozen=True)
class MetricSpec:
    """``mean`` of one column per user, or ``ratio`` of two column sums (delta method)."""

    kind: str
    column: str | None = None
    numerator: str | None = None
    denominator: str | None = None

    @classmethod
    def from_params(cls, name: str, raw: Any) -> MetricSpec:
        if not isinstance(raw, Mapping):
            raise ValueError(f"{name} must be an object with a kind")
        kind = raw.get("kind")
        fields = {"mean": ("column",), "ratio": ("numerator", "denominator")}.get(kind)
        if fields is None:
            raise ValueError(f"{name}.kind must be 'mean' or 'ratio', got {kind!r}")
        unknown = set(raw) - {"kind", *fields}
        if unknown:
            raise ValueError(f"{name}: unknown key(s) {sorted(unknown)}")
        for field in fields:
            if not isinstance(raw.get(field), str) or not raw[field]:
                raise ValueError(f"{name}.{field} must name a data column")
        return cls(kind, **{f: raw[f] for f in fields})

    @property
    def columns(self) -> tuple[str, ...]:
        if self.kind == "mean":
            return (self.column,)
        return (self.numerator, self.denominator)

    @property
    def label(self) -> str:
        if self.kind == "mean":
            return f"mean {self.column} per user"
        return f"{self.numerator} / {self.denominator} (ratio of sums)"


@dataclass(frozen=True)
class ReadoutSpec:
    alpha: float
    srm_threshold: float
    expected_shares: dict[str, float]
    metric: MetricSpec
    early_metric: MetricSpec | None = None
    by_persona: bool = False
    #: Interim days someone already peeked at; recorded, never used to decide.
    looks: tuple[int, ...] = ()
    window_days: int | None = None

    @classmethod
    def from_params(cls, params: Mapping[str, Any]) -> ReadoutSpec:
        unknown = set(params) - _KEYS
        if unknown:
            raise ValueError(f"unknown readout param(s) {sorted(unknown)}")
        alpha = check_alpha(params.get("alpha", 0.05))
        threshold = params.get("srm_threshold", SRM_THRESHOLD)
        if not (isinstance(threshold, int | float) and 0 < threshold < 1):
            raise ValueError(f"srm_threshold must be in (0, 1), got {threshold!r}")
        early = params.get("early_metric")
        looks = params.get("looks", [])
        window = params.get("window_days")
        if not isinstance(looks, list) or not all(_is_int(d) and d > 0 for d in looks):
            raise ValueError("looks must be a list of positive whole days")
        if looks and not (_is_int(window) and window >= 0):
            raise ValueError("looks need window_days, a whole number of days >= 0")
        by_persona = params.get("by_persona", False)
        if not isinstance(by_persona, bool):
            raise ValueError("by_persona must be true or false")
        return cls(
            alpha=alpha,
            srm_threshold=float(threshold),
            expected_shares=_shares(params.get("expected_shares")),
            metric=MetricSpec.from_params("metric", params.get("metric")),
            early_metric=None if early is None else MetricSpec.from_params("early_metric", early),
            by_persona=by_persona,
            looks=tuple(int(d) for d in looks),
            window_days=None if window is None else int(window),
        )


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _shares(raw: Any) -> dict[str, float]:
    if not isinstance(raw, Mapping):
        raise ValueError("expected_shares must map each arm to its planned share")
    missing = [arm for arm in _ARMS if arm not in raw]
    if missing:
        raise ValueError(f"expected_shares needs the arm(s) {missing}: control and treatment")
    for arm, share in raw.items():
        if not (isinstance(share, int | float) and math.isfinite(share) and share > 0):
            raise ValueError(f"expected_shares.{arm} must be a positive number")
    return {str(arm): float(share) for arm, share in raw.items()}
