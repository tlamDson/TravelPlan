"""Independent screening of a G-sim case's frozen data (NumPy / scipy only, never abkit).

The right decision of a case comes from its planted parameters (``SimCase.verdict``). One
seeded draw can still disagree with it by chance: an A/A run that crosses ``alpha``, an effect
run that misses it. ``screen`` accepts a draw only when a plain fixed-horizon readout of the
data agrees with the planted verdict, every estimate lands within tolerance of the true
effect, and the case's trap is really there (novelty: the early window would ship; peeking:
some interim look would ship). The freezer records how many seeds it tried.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

import numpy as np
from scipy import stats

from simkit.golden_cases import ALPHA, PERSONA_NAMES, SRM_THRESHOLD, SimCase

Data = Mapping[str, np.ndarray]


@dataclass(frozen=True)
class Verdict:
    outcome: str  # ship / harm / flat / invalid
    srm_p: float
    estimate: float | None = None
    p_value: float | None = None


@dataclass(frozen=True)
class Peek:
    day: int
    estimate: float
    p_value: float


def _test(spec: Mapping[str, str], data: Data, mask: np.ndarray) -> tuple[float, float]:
    """(treatment − control estimate, two-sided p): Welch, or delta-method z for a ratio."""
    treat = mask & (data["variant"] == "treatment")
    ctrl = mask & (data["variant"] == "control")
    if spec["kind"] == "ratio":
        est, var = 0.0, 0.0
        for arm, sign in ((treat, 1.0), (ctrl, -1.0)):
            num, den = data[spec["numerator"]][arm], data[spec["denominator"]][arm]
            r = num.sum() / den.sum()
            cov = np.cov(num, den, ddof=1)
            inner = cov[0, 0] - 2 * r * cov[0, 1] + r * r * cov[1, 1]
            est += sign * r
            var += inner / (len(num) * den.mean() ** 2)
        return float(est), float(2 * stats.norm.sf(abs(est) / np.sqrt(var)))
    values = data[spec["column"]]
    result = stats.ttest_ind(values[treat], values[ctrl], equal_var=False)
    return float(values[treat].mean() - values[ctrl].mean()), float(result.pvalue)


def _outcome(estimate: float, p_value: float) -> str:
    if p_value < ALPHA:
        return "ship" if estimate > 0 else "harm"
    return "flat"


def verdict(case: SimCase, data: Data) -> Verdict:
    """SRM chi-square first; then the primary metric at the planned horizon (all rows)."""
    counts = [int((data["variant"] == v).sum()) for v in ("control", "treatment")]
    srm_p = float(stats.chisquare(counts).pvalue)  # 50/50 expected
    if srm_p < SRM_THRESHOLD:
        return Verdict("invalid", srm_p)
    everyone = np.ones(len(data["variant"]), dtype=bool)
    estimate, p_value = _test(case.metric_spec(), data, everyone)
    return Verdict(_outcome(estimate, p_value), srm_p, estimate, p_value)


def naive_peek(case: SimCase, data: Data) -> Peek | None:
    """First interim look where a naive Welch test would have shipped, if any.

    At the end of day ``d`` only users with ``exposure_day < d − window_days`` have a full
    window, so a look sees just them.
    """
    for day in case.looks:
        mask = data["exposure_day"] < day - case.window_days
        if min((mask & (data["variant"] == v)).sum() for v in ("control", "treatment")) < 2:
            continue
        estimate, p_value = _test(case.metric_spec(), data, mask)
        if _outcome(estimate, p_value) == "ship":
            return Peek(day, estimate, p_value)
    return None


def early_test(case: SimCase, data: Data) -> tuple[float, float]:
    everyone = np.ones(len(data["variant"]), dtype=bool)
    return _test(case.params()["early_metric"], data, everyone)


def screen(
    case: SimCase,
    data: Data,
    expected: Mapping[str, object],
    tolerance: Mapping[str, Mapping[str, float]],
) -> list[str]:
    """Why this draw cannot be frozen for ``case``; an empty list accepts it."""
    problems = []
    v = verdict(case, data)
    if v.outcome != case.verdict:
        problems.append(f"reference readout says {v.outcome}, planted verdict is {case.verdict}")
    if v.outcome == "invalid" or case.verdict == "invalid":
        return problems
    everyone = np.ones(len(data["variant"]), dtype=bool)
    params = case.params()
    checks = {"estimate": (params["metric"], everyone)}
    if "early_metric" in params:
        checks["early_estimate"] = (params["early_metric"], everyone)
    if case.by_persona:
        for persona in PERSONA_NAMES:
            checks[f"estimate_{persona}"] = (params["metric"], data["persona"] == persona)
    for key, (spec, mask) in checks.items():
        observed, _ = _test(spec, data, mask)
        if abs(observed - expected[key]) > tolerance[key]["abs"]:
            problems.append(f"{key}: observed {observed:.4g} is off the true {expected[key]:.4g}")
    if case.metric == "late" and _outcome(*early_test(case, data)) != "ship":
        problems.append("novelty trap missing: the early window would not ship")
    if case.peeking and naive_peek(case, data) is None:
        problems.append("peeking trap missing: no interim look would ship")
    return problems
