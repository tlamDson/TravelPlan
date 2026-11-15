"""A blinded readout: the evidence of a readout memo with abkit's conclusion taken out.

What stays: who the users are (simulated or real), the planned test, the sample ratio
check as numbers, and every effect, also when SRM fails. What goes: the decision, the
PASS/FAIL words, the prose that interprets an interval, and the case id and description
(they name the injected effect). The labeller decides from the numbers alone.
"""

from __future__ import annotations

from dataclasses import dataclass

from abkit.readout import Effect, Readout

_SIMULATED = "> **Simulated data (virtual users).** None of these users are real TravelPlan users."


@dataclass(frozen=True)
class Look:
    """The primary effect among the users visible at an interim look on ``day``."""

    day: int
    effect: Effect | None


def _num(x: float) -> str:
    return f"{x:+.4g}"


def _p(p: float) -> str:
    return "< 0.0001" if p < 1e-4 else f"{p:.4f}"


def _ci(e: Effect) -> str:
    return f"[{_num(e.ci_low)}, {_num(e.ci_high)}]"


def _lift(e: Effect) -> str:
    return "n/a" if e.relative_lift is None else f"{e.relative_lift:+.1%}"


def _effect_table(level: str, e: Effect) -> list[str]:
    return [
        f"| Control | Treatment | Difference (T − C) | Relative lift | {level} | p |",
        "|---:|---:|---:|---:|---|---:|",
        f"| {e.control_value:.4g} | {e.treatment_value:.4g} | {_num(e.estimate)} | "
        f"{_lift(e)} | {_ci(e)} | {_p(e.p_value)} |",
    ]


def _srm(r: Readout) -> list[str]:
    total = sum(r.counts.values())
    planned = sum(r.spec.expected_shares.values())
    lines = [
        "## Sample ratio",
        "",
        "| Arm | Users | Planned share | Observed share |",
        "|---|---:|---:|---:|",
    ]
    for arm, n in r.counts.items():
        lines.append(
            f"| {arm} | {n} | {r.spec.expected_shares[arm] / planned:.1%} | {n / total:.1%} |"
        )
    lines += ["", f"Chi-square = {r.srm.statistic:.3g} ({r.srm.dof} df), p = {r.srm.p_value:.2e}."]
    return lines


def _personas(r: Readout, level: str) -> list[str]:
    lines = [
        f"## By persona: {r.spec.metric.label}",
        "",
        f"| Persona | Control n | Treatment n | Difference | {level} | p |",
        "|---|---:|---:|---:|---|---:|",
    ]
    for e in r.personas:
        lines.append(
            f"| {e.group} | {e.n_control} | {e.n_treatment} | {_num(e.estimate)} | "
            f"{_ci(e)} | {_p(e.p_value)} |"
        )
    if r.heterogeneity_p is not None:
        lines += ["", f"Cochran's Q test of one shared effect: p = {_p(r.heterogeneity_p)}."]
    return lines


def _looks(r: Readout, looks: tuple[Look, ...], level: str) -> list[str]:
    lines = [
        "## Interim looks",
        "",
        f"Someone looked at days {', '.join(str(k.day) for k in looks)}. A look at day d saw "
        f"the users exposed before day d − {r.spec.window_days}.",
        "",
        f"| Day | Users seen | Difference | {level} | p |",
        "|---:|---:|---:|---|---:|",
    ]
    for k in looks:
        e = k.effect
        if e is None:
            lines.append(f"| {k.day} | too few | | | |")
        else:
            lines.append(
                f"| {k.day} | {e.n_control + e.n_treatment} | {_num(e.estimate)} | "
                f"{_ci(e)} | {_p(e.p_value)} |"
            )
    return lines


def _plan(r: Readout) -> list[str]:
    test = "Welch t-test" if r.spec.metric.kind == "mean" else "delta-method z-test"
    n = sum(r.counts.values())
    return [
        "## Plan",
        "",
        f"- {test}, two-sided, alpha = {r.spec.alpha:g}; estimates are treatment − control.",
        f"- Planned horizon: all {n} enrolled users (the primary table above).",
        f"- Sample ratio alert when the chi-square p < {r.spec.srm_threshold:g}.",
    ]


def render_blinded(
    readout: Readout,
    *,
    blind_id: str,
    simulated: bool,
    context: str | None = None,
    looks: tuple[Look, ...] = (),
) -> str:
    """Markdown of ``readout`` without its conclusion; ``readout`` must carry its effects."""
    r = readout
    if r.primary is None:
        raise ValueError("a blinded readout needs its effects: run_readout(effects_when_blocked)")
    level = f"{1 - r.spec.alpha:.0%} CI"
    lines = [f"# Readout {blind_id}", ""]
    lines += [_SIMULATED if simulated else "> **Real users.**", ""]
    if context:
        lines += [context, ""]
    lines += [*_srm(r), ""]
    lines += [f"## Primary metric: {r.spec.metric.label}", "", *_effect_table(level, r.primary)]
    if r.early is not None:
        early = [
            f"## Early window: {r.spec.early_metric.label}",
            "",
            *_effect_table(level, r.early),
        ]
        lines += ["", *early]
    if r.personas:
        lines += ["", *_personas(r, level)]
    if looks:
        lines += ["", *_looks(r, looks, level)]
    lines += ["", *_plan(r), "", "## Your call: ship, no ship, or investigate", ""]
    return "\n".join(lines)
