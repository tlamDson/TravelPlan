"""One experiment readout: the SRM guardrail first, then one decision on the primary metric.

Order matters. When the chi-square SRM test fails (``p < srm_threshold``) the split is
broken, so no effect is computed at all and the decision is ``invalid``. Otherwise the
primary metric is tested once, at the planned horizon on every enrolled user (Welch for a
mean, delta-method z for a ratio): ``ship`` when ``p < alpha`` and the effect is positive,
else ``no_ship``. Interim looks and the early (novelty) window are reported, never decided on.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import numpy as np

from abkit import stats
from abkit.readout.spec import MetricSpec, ReadoutSpec

Data = Mapping[str, np.ndarray]


@dataclass(frozen=True)
class Effect:
    """Treatment minus control on one metric, for everyone (``group=None``) or one persona."""

    group: str | None
    n_control: int
    n_treatment: int
    control_value: float
    treatment_value: float
    estimate: float
    se: float
    ci_low: float
    ci_high: float
    p_value: float
    #: Smallest absolute difference a t-test of this size detects with 80% power (mean only).
    mde: float | None

    @property
    def relative_lift(self) -> float | None:
        return None if self.control_value == 0 else self.estimate / self.control_value


@dataclass(frozen=True)
class Readout:
    spec: ReadoutSpec
    counts: dict[str, int]
    srm: stats.SrmResult
    primary: Effect | None
    early: Effect | None = None
    personas: tuple[Effect, ...] = ()
    #: Cochran's Q p-value for "every persona shares one effect" (mean metrics only).
    heterogeneity_p: float | None = None

    @property
    def blocked(self) -> bool:
        return self.srm.srm

    @property
    def verdict(self) -> str:
        """``invalid``, ``ship``, ``harm`` (significant drop) or ``flat``."""
        if self.blocked:
            return "invalid"
        if self.primary.p_value < self.spec.alpha:
            return "ship" if self.primary.estimate > 0 else "harm"
        return "flat"

    @property
    def decision(self) -> str:
        """The G-sim decision: ``invalid``, ``ship`` or ``no_ship``."""
        return {"harm": "no_ship", "flat": "no_ship"}.get(self.verdict, self.verdict)

    @property
    def novelty_faded(self) -> bool:
        """The early window would have shipped but the lasting metric does not."""
        early = self.early
        if early is None or self.verdict == "ship":
            return False
        return early.p_value < self.spec.alpha and early.estimate > 0

    def golden_outputs(self) -> dict[str, Any]:
        """Output keys of the ``readout`` golden method; only ``srm`` when blocked."""
        out: dict[str, Any] = {"srm": self.blocked, "decision": self.decision}
        if self.blocked:
            return out
        out["estimate"] = self.primary.estimate
        if self.early is not None:
            out["early_estimate"] = self.early.estimate
        for p in self.personas:
            out[f"estimate_{p.group}"] = p.estimate
        return out


def _column(data: Data, name: str) -> np.ndarray:
    if name not in data:
        raise ValueError(f"data has no column {name!r}; columns: {sorted(data)}")
    return np.asarray(data[name])


def _counts(variant: np.ndarray, spec: ReadoutSpec) -> dict[str, int]:
    unknown = sorted(set(variant.tolist()) - set(spec.expected_shares))
    if unknown:
        raise ValueError(
            f"rows in unplanned arm(s) {unknown}; planned: {sorted(spec.expected_shares)}"
        )
    return {arm: int((variant == arm).sum()) for arm in spec.expected_shares}


def _pooled_sd(c: np.ndarray, t: np.ndarray) -> float:
    pooled = ((c.size - 1) * c.var(ddof=1) + (t.size - 1) * t.var(ddof=1)) / (c.size + t.size - 2)
    return math.sqrt(pooled)


def measure_effect(
    metric: MetricSpec, data: Data, mask: np.ndarray, alpha: float, group: str | None = None
) -> Effect:
    """Treatment minus control on ``metric`` among the users where ``mask`` is true."""
    variant = np.asarray(data["variant"])
    ctrl, treat = mask & (variant == "control"), mask & (variant == "treatment")
    n_c, n_t = int(ctrl.sum()), int(treat.sum())
    if n_c < 2 or n_t < 2:
        who = "the experiment" if group is None else f"persona {group!r}"
        raise ValueError(
            f"{who} needs at least 2 users per arm, got {n_c} control and {n_t} treatment"
        )
    if metric.kind == "mean":
        y = _column(data, metric.column).astype(np.float64)
        r = stats.welch_ttest(y[ctrl], y[treat], alpha=alpha)
        values = (float(y[ctrl].mean()), float(y[treat].mean()))
        d = stats.mde_ttest_ind(nobs1=n_c, power=0.8, alpha=alpha, ratio=n_t / n_c)
        mde = d * _pooled_sd(y[ctrl], y[treat])
    else:
        num = _column(data, metric.numerator).astype(np.float64)
        den = _column(data, metric.denominator).astype(np.float64)
        r = stats.delta_ratio(num[ctrl], den[ctrl], num[treat], den[treat], alpha=alpha)
        values, mde = (r.ratio_control, r.ratio_treatment), None
    return Effect(group, n_c, n_t, *values, r.estimate, r.se, r.ci_low, r.ci_high, r.p_value, mde)


def run_readout(
    data: Data, params: Mapping[str, Any], *, effects_when_blocked: bool = False
) -> Readout:
    """``data``: one row per enrolled user (``variant`` plus metric columns).

    ``effects_when_blocked`` still measures the effects when SRM fails, for a blinded
    readout that shows the evidence; the readout stays blocked and its decision ``invalid``.
    """
    spec = ReadoutSpec.from_params(params)
    variant = _column(data, "variant").astype(str)
    for name in spec.metric.columns + (spec.early_metric.columns if spec.early_metric else ()):
        _column(data, name)
    counts = _counts(variant, spec)
    srm = stats.srm_chisquare(
        list(counts.values()), list(spec.expected_shares.values()), spec.srm_threshold
    )
    if srm.srm and not effects_when_blocked:
        return Readout(spec, counts, srm, primary=None)
    everyone = np.ones(variant.size, dtype=bool)
    primary = measure_effect(spec.metric, data, everyone, spec.alpha)
    early = None
    if spec.early_metric is not None:
        early = measure_effect(spec.early_metric, data, everyone, spec.alpha)
    personas, q_p = (), None
    if spec.by_persona:
        persona = _column(data, "persona").astype(str)
        personas = tuple(
            measure_effect(spec.metric, data, persona == p, spec.alpha, group=str(p))
            for p in np.unique(persona)
        )
        if spec.metric.kind == "mean":
            y = _column(data, spec.metric.column).astype(np.float64)
            q_p = stats.cate_by_group(y, variant == "treatment", persona, spec.alpha).q_p_value
    return Readout(spec, counts, srm, primary, early, personas, q_p)
