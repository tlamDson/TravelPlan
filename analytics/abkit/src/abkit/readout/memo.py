"""The one-page Markdown readout memo.

The decision comes first, the SRM guardrail second. When SRM fails the memo says
CONCLUSION BLOCKED and prints the counts that broke the split, and no effect at all:
``Readout`` holds none to print.
"""

from __future__ import annotations

from abkit.readout.analysis import Effect, Readout

_SIMULATED = (
    "> **Simulated data (virtual users).** None of these users are real TravelPlan users; "
    "they are counted apart from real traffic."
)
_HEADINGS = {
    "ship": "SHIP",
    "harm": "NO SHIP",
    "flat": "NO SHIP",
    "invalid": "CONCLUSION BLOCKED (sample ratio mismatch)",
}


def _num(x: float) -> str:
    return f"{x:+.4g}"


def _p(p: float) -> str:
    return "< 0.0001" if p < 1e-4 else f"{p:.4f}"


def _p_is(p: float) -> str:
    """``p = 0.0311`` or ``p < 0.0001``, for prose."""
    return "p < 0.0001" if p < 1e-4 else f"p = {p:.4f}"


def _ci(e: Effect) -> str:
    return f"[{_num(e.ci_low)}, {_num(e.ci_high)}]"


def _lift(e: Effect) -> str:
    return "n/a" if e.relative_lift is None else f"{e.relative_lift:+.1%}"


def _level(r: Readout) -> str:
    return f"{1 - r.spec.alpha:.0%} CI"


def _reason(r: Readout) -> str:
    if r.blocked:
        return (
            f"Sample ratio mismatch: the chi-square test of users per arm gives "
            f"p = {r.srm.p_value:.2e}, below {r.spec.srm_threshold:g}. The split or the "
            "exposure logging is broken, so the arms are not comparable and no conclusion "
            "is drawn. Fix the cause and rerun the experiment."
        )
    e, label = r.primary, r.spec.metric.label
    if r.verdict == "ship":
        return (
            f"{label[0].upper()}{label[1:]} rose by {_num(e.estimate)} ({_lift(e)}); "
            f"the {_level(r)} {_ci(e)} excludes zero ({_p_is(e.p_value)})."
        )
    if r.verdict == "harm":
        return (
            f"The change hurts: {label} fell by {_num(e.estimate)} ({_lift(e)}), "
            f"{_level(r)} {_ci(e)} ({_p_is(e.p_value)})."
        )
    power = "" if e.mde is None else f" This test detects about ±{e.mde:.3g} with 80% power."
    return (
        f"No detectable effect on {label}: {_p_is(e.p_value)} is not below "
        f"{r.spec.alpha:g}, and the {_level(r)} {_ci(e)} includes zero.{power}"
    )


def _srm_section(r: Readout) -> list[str]:
    total = sum(r.counts.values())
    planned = sum(r.spec.expected_shares.values())
    lines = [
        f"### Sample ratio check: {'FAIL' if r.blocked else 'PASS'}",
        "",
        "| Arm | Users | Planned share | Observed share |",
        "|---|---:|---:|---:|",
    ]
    for arm, n in r.counts.items():
        share = r.spec.expected_shares[arm] / planned
        lines.append(f"| {arm} | {n} | {share:.1%} | {n / total:.1%} |")
    lines += [
        "",
        f"Chi-square = {r.srm.statistic:.3g} ({r.srm.dof} df), p = {r.srm.p_value:.2e}; "
        f"the readout is blocked below p = {r.spec.srm_threshold:g}.",
    ]
    return lines


def _effect_table(r: Readout, e: Effect) -> list[str]:
    return [
        f"| Control | Treatment | Difference (T − C) | Relative lift | {_level(r)} | p |",
        "|---:|---:|---:|---:|---|---:|",
        f"| {e.control_value:.4g} | {e.treatment_value:.4g} | {_num(e.estimate)} | "
        f"{_lift(e)} | {_ci(e)} | {_p(e.p_value)} |",
    ]


def _early_section(r: Readout) -> list[str]:
    note = (
        "The early window would have shipped, but the lift is gone later: a novelty "
        "effect. The decision uses the later window."
        if r.novelty_faded
        else "The decision uses the later window; the early window is shown as a check."
    )
    return [
        f"### Early window: {r.spec.early_metric.label}",
        "",
        *_effect_table(r, r.early),
        "",
        note,
    ]


def _persona_section(r: Readout) -> list[str]:
    lines = [
        f"### By persona: {r.spec.metric.label}",
        "",
        f"| Persona | Control n | Treatment n | Difference | {_level(r)} | p |",
        "|---|---:|---:|---:|---|---:|",
    ]
    for e in r.personas:
        lines.append(
            f"| {e.group} | {e.n_control} | {e.n_treatment} | {_num(e.estimate)} | "
            f"{_ci(e)} | {_p(e.p_value)} |"
        )
    if r.heterogeneity_p is not None:
        differ = "differ" if r.heterogeneity_p < r.spec.alpha else "do not clearly differ"
        lines += ["", f"Cochran's Q {_p_is(r.heterogeneity_p)}: the persona effects {differ}."]
    return lines


def _notes(r: Readout) -> list[str]:
    n = sum(r.counts.values())
    test = "Welch t-test" if r.spec.metric.kind == "mean" else "delta-method z-test"
    notes = [f"- {test}, two-sided, alpha = {r.spec.alpha:g}; estimates are treatment − control."]
    horizon = f"- Decided once at the planned horizon on all {n} enrolled users"
    if r.spec.looks:
        days = ", ".join(str(d) for d in r.spec.looks)
        horizon += f"; {len(r.spec.looks)} interim looks (days {days}) were ignored"
    return ["### Notes", "", *notes, horizon + "."]


def render_memo(
    readout: Readout, *, title: str, simulated: bool, description: str | None = None
) -> str:
    """Markdown memo of ``readout``; ``simulated`` adds the virtual-users banner."""
    r = readout
    lines = [f"# Readout: {title}", ""]
    if simulated:
        lines += [_SIMULATED, ""]
    if description:
        lines += [description.strip(), ""]
    lines += [f"## Decision: {_HEADINGS[r.verdict]}", "", _reason(r), "", *_srm_section(r), ""]
    if r.blocked:
        lines += ["Effect estimates are withheld until the split is fixed.", ""]
        return "\n".join(lines)
    lines += [f"### Primary metric: {r.spec.metric.label}", "", *_effect_table(r, r.primary), ""]
    if r.early is not None:
        lines += [*_early_section(r), ""]
    if r.personas:
        lines += [*_persona_section(r), ""]
    lines += _notes(r)
    return "\n".join(lines) + "\n"
