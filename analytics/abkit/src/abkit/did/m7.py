"""M7: DiD estimate, CI and pre-trend p of GitHub Actions on PR merge time (B2 plan, PR 19).

    python -m abkit.did.m7 [--panel PATH] [--pr 19] [--runs PATH] [--dry-run]

Question G-B2-1: when a repository starts using GitHub Actions, how does the time to merge a
PR change? Outcome: mean ``log1p`` hours from PR creation to merge, per repo and period, on
the committed 400-repo panel of PR 18. The specs below were fixed before any estimate was
seen. ``main`` is the Sun & Abraham event study on calendar quarters, four quarters either
side of adoption (quarters because about half the adopters have no merged PR in the month
before adoption, which leaves their monthly cohort without a reference period). The others
change one thing each: controls, weights, monthly periods, the median outcome, a placebo
adoption four quarters early, and the pooled and static TWFE that staggered timing biases.

Rows go to ``analytics/runs/runs.csv`` with ``metric_id`` M7; the repositories are real, so
``simulated`` is false.
"""

from __future__ import annotations

import argparse
import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from abkit.bench import _git_sha
from abkit.causal.estimators import CausalResult
from abkit.did.actions import ACTIONS_PANEL_CSV, load_actions_panel
from abkit.did.panel import placebo_shift
from abkit.did.results import EventStudy
from abkit.did.sunab import sun_abraham, twfe_event_study, twfe_static
from abkit.runs import RUNS_CSV_PATH, RunRecord, append_run

UNIT = "log1p hours"


@dataclass(frozen=True)
class Spec:
    name: str
    estimator: str = "sun_abraham"
    period_months: int = 3
    pre: int = 4
    post: int = 4
    controls: str = "never_and_late"
    weighted: bool = False
    outcome: str = "mean_log1p"
    #: Periods to move adoption earlier on pre-adoption rows only (0: the real adoption).
    placebo: int = 0
    about: str = "Sun & Abraham (2021) interaction-weighted event study"


SPECS: tuple[Spec, ...] = (
    Spec("main"),
    Spec("never_controls", controls="never", about="Sun & Abraham, never-adopters as controls"),
    Spec("pr_weighted", weighted=True, about="Sun & Abraham, rows weighted by merged PRs"),
    Spec("monthly", period_months=1, pre=12, post=12, about="Sun & Abraham on months"),
    Spec(
        "monthly_median",
        period_months=1,
        pre=12,
        post=12,
        outcome="log1p_median",
        about="Sun & Abraham on months, outcome log1p of the monthly median hours",
    ),
    Spec(
        "placebo_4q",
        post=3,
        placebo=4,
        about="Sun & Abraham placebo: fake adoption 4 quarters early, pre-adoption rows only",
    ),
    Spec("twfe_event", estimator="twfe_event_study", about="pooled TWFE event study"),
    Spec("twfe_static", estimator="twfe_static", about="static TWFE, one treated dummy"),
)


@dataclass(frozen=True)
class SpecResult:
    spec: Spec
    att: CausalResult
    study: EventStudy | None


def run_spec(spec: Spec, panel_path: Path = ACTIONS_PANEL_CSV) -> SpecResult:
    panel = load_actions_panel(
        panel_path,
        outcome=spec.outcome,
        period_months=spec.period_months,
        controls=spec.controls,
        weighted=spec.weighted,
    )
    if spec.placebo:
        panel = placebo_shift(panel, spec.placebo)
    if spec.estimator == "twfe_static":
        return SpecResult(spec, twfe_static(panel, controls=spec.controls), None)
    estimate = sun_abraham if spec.estimator == "sun_abraham" else twfe_event_study
    study = estimate(panel, spec.pre, spec.post, controls=spec.controls)
    return SpecResult(spec, study.att, study)


def run_specs(panel_path: Path = ACTIONS_PANEL_CSV) -> dict[str, SpecResult]:
    return {spec.name: run_spec(spec, panel_path) for spec in SPECS}


def _notes(result: SpecResult) -> str:
    s, att = result.spec, result.att
    period = "quarters" if s.period_months == 3 else f"{s.period_months}-month periods"
    text = (
        f"{s.about}; GitHub Actions adoption vs PR merge time, PR 18 panel (400 repos, seed "
        f"18); outcome {s.outcome} per repo and period, {period}, window "
        f"[-{s.pre}, {s.post}], ref -1, controls {s.controls}, weighted={s.weighted}; "
        f"{att.n_treated} adopters, {att.n_control} controls; repo-clustered CR1 SE "
        f"{att.se:.4g}, normal 95% CI"
    )
    if result.study is not None:
        st = result.study
        text += (
            f"; {st.n_obs} rows; ATT = mean of event times 0..{s.post}; pre-trend Wald "
            f"chi2={st.pretrend_stat:.4g} df={st.pretrend_df}; dropped cohorts without a "
            f"ref-period row: {len(st.dropped_cohorts)}"
        )
    return text


def _spec_rows(result: SpecResult) -> list[tuple[str, float, str, str]]:
    """(metric, value, unit, extra note) of one spec."""
    name, att = result.spec.name, result.att
    pct = "; 100*(exp(ATT)-1): about the % change in geometric-mean (1 + hours)"
    rows = [
        (f"did_att_{name}", att.estimate, UNIT, ""),
        (f"did_att_ci95_low_{name}", att.ci_low, UNIT, ""),
        (f"did_att_ci95_high_{name}", att.ci_high, UNIT, ""),
        (f"did_att_p_{name}", att.p_value, "p", ""),
        (f"did_att_pct_{name}", 100 * math.expm1(att.estimate), "%", pct),
    ]
    if result.study is None:
        return rows
    rows.append((f"did_pretrend_p_{name}", result.study.pretrend_p, "p", ""))
    if name == "main":
        for e in result.study.event_times:
            extra = (
                f"; event time {e.rel}: se={e.se:.4g} CI=[{e.ci_low:.4g}, {e.ci_high:.4g}]"
                f" p={e.p_value:.4g} treated rows={e.n_obs}"
            )
            rows.append((f"did_event_main_l{e.rel}", e.estimate, UNIT, extra))
    return rows


def m7_records(
    results: dict[str, SpecResult], pr: str, git_sha: str, run_at: str
) -> list[RunRecord]:
    records = []
    for result in results.values():
        notes, n = _notes(result), result.att.n_treated + result.att.n_control
        for metric, value, unit, extra in _spec_rows(result):
            records.append(
                RunRecord(
                    run_at=run_at,
                    git_sha=git_sha,
                    pr=pr,
                    metric_id="M7",
                    metric=metric,
                    value=float(value),
                    unit=unit,
                    n=n,
                    seed="18",
                    simulated=False,
                    notes=notes + extra,
                )
            )
    return records


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m abkit.did.m7", description=__doc__)
    parser.add_argument("--panel", type=Path, default=ACTIONS_PANEL_CSV)
    parser.add_argument("--pr", default="")
    parser.add_argument("--runs", type=Path, default=RUNS_CSV_PATH)
    parser.add_argument("--dry-run", action="store_true", help="print rows, do not append them")
    args = parser.parse_args(argv)
    run_at, sha = datetime.now(UTC).isoformat(timespec="seconds"), _git_sha()
    for record in m7_records(run_specs(args.panel), args.pr, sha, run_at):
        if not args.dry_run:
            append_run(record, args.runs)
        print(f"{record.metric}={record.value:.6g} {record.unit} (n={record.n})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
