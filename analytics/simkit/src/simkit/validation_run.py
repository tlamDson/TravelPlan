"""PR 14 run: 1k / 5k / 50k virtual users, +3% injected, 1,000 simulated experiments per size.

Appends to ``analytics/runs/runs.csv`` (``simulated=true``):

- M2: empirical Welch power next to the analytic two-proportion power, the A/A false positive
  rate, and the users per arm that +3% needs for 80% power.
- M5: bias and 95% CI coverage of the ATE and of each persona's CATE against the injected truth.
- CATE: RMSE per persona, power and A/A false positive rate of Cochran's Q (do personas
  differ?), and how often the estimated persona order matches the true one.

    python -m simkit.validation_run --pr 14 [--sizes 1000 5000 50000] [--n-runs 1000] [--dry-run]
"""

from __future__ import annotations

import argparse
import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from abkit.bench import _git_sha
from abkit.runs import RUNS_CSV_PATH, RunRecord, append_run
from abkit.stats import sample_size_proportions

from simkit.validation_sim import (
    DEFAULT_LIFT,
    Scenario,
    Summary,
    build_scenario,
    simulate_runs,
    summarize,
)

SIZES = (1000, 5000, 50_000)
N_RUNS = 1000
DEFAULT_SEED = 20261114
ALPHA = 0.05


@dataclass(frozen=True)
class SizeResult:
    n_users: int
    effect: Summary
    aa: Summary  # same size, no effect, seed + 1


def run_validation(
    scenario: Scenario,
    sizes: Sequence[int] = SIZES,
    n_runs: int = N_RUNS,
    seed: int = DEFAULT_SEED,
    alpha: float = ALPHA,
) -> list[SizeResult]:
    null = scenario.null()
    results = []
    for n in sizes:
        effect = summarize(scenario, simulate_runs(scenario, n, n_runs, seed, alpha))
        aa = summarize(null, simulate_runs(null, n, n_runs, seed + 1, alpha))
        results.append(SizeResult(n, effect, aa))
    return results


def _scenario_notes(s: Scenario) -> str:
    lifts = " ".join(
        f"{n}={(t / p):.4f}" for n, t, p in zip(s.names, s.truth, s.p_control, strict=True)
    )
    rates = " ".join(f"{n}={p:.4f}" for n, p in zip(s.names, s.p_control, strict=True))
    return (
        f"relative_lift={s.relative_lift} on P(trip_saved in the exposed session), "
        f"persona relative lifts {lifts}; p_control {rates} (exact, persona Markov chain); "
        f"p_control_all={s.p_control_all:.4f} 50/50 arms"
    )


def _binomial_se(rate: float, n: int) -> float:
    return math.sqrt(rate * (1 - rate) / n)


def _size_rows(r: SizeResult, names: Sequence[str]) -> list[tuple]:
    """(metric_id, metric, unit, value, mc_se, from_aa) for one size."""
    e, aa, n = r.effect, r.aa, r.effect.n_runs

    def share(metric_id: str, metric: str, value: float, from_aa: bool = False) -> tuple:
        return (metric_id, metric, "proportion", value, _binomial_se(value, n), from_aa)

    rows = [
        share("M2", "power_welch", e.reject_rate),
        ("M2", "power_analytic", "proportion", e.analytic_power, 0.0, False),
        share("M2", "fpr_aa_welch", aa.reject_rate, from_aa=True),
        ("M5", "bias_ate_pp", "pp", 100 * e.ate_bias, 100 * e.ate_bias_se, False),
        share("M5", "ci95_coverage_ate", e.ate_coverage),
    ]
    for j, name in enumerate(names):
        rows.append(
            (
                "M5",
                f"bias_cate_{name}_pp",
                "pp",
                100 * e.cate_bias[j],
                100 * e.cate_bias_se[j],
                False,
            )
        )
    rows += [
        share("M5", f"ci95_coverage_cate_{name}", e.cate_coverage[j])
        for j, name in enumerate(names)
    ]
    for j, name in enumerate(names):
        rows.append(
            (
                "CATE",
                f"rmse_cate_{name}_pp",
                "pp",
                100 * e.cate_rmse[j],
                100 * e.cate_rmse_se[j],
                False,
            )
        )
    rows += [
        share("CATE", "cate_heterogeneity_power", e.heterogeneity_reject_rate),
        share("CATE", "cate_heterogeneity_fpr_aa", aa.heterogeneity_reject_rate, from_aa=True),
    ]
    if e.rank_accuracy is not None:
        rows.append(share("CATE", "cate_rank_accuracy", e.rank_accuracy))
    return rows


def to_run_records(
    results: Sequence[SizeResult], scenario: Scenario, pr: str, git_sha: str, seed: int
) -> list[RunRecord]:
    run_at = datetime.now(UTC).isoformat(timespec="seconds")
    base = _scenario_notes(scenario)

    def record(metric_id, metric, unit, value, n, seed_text, notes) -> RunRecord:
        return RunRecord(
            run_at, git_sha, pr, metric_id, metric, float(value), unit, n, seed_text, True, notes
        )

    needed = sample_size_proportions(
        scenario.p_control_all, scenario.p_treatment_all, power=0.8, alpha=ALPHA
    ).nobs1
    records = [
        record(
            "M2",
            "n_per_arm_80pct_power",
            "users",
            math.ceil(needed),
            0,
            "",
            f"virtual users; analytic two-proportion z-test, alpha={ALPHA} power=0.8, "
            f"mc_se=0 (analytic); {base}",
        )
    ]
    for r in results:
        n_runs = r.effect.n_runs
        for metric_id, metric, unit, value, mc_se, from_aa in _size_rows(r, scenario.names):
            kind = "A/A (no effect)" if from_aa else "injected effect"
            notes = (
                f"virtual users; {n_runs} simulated experiments of {r.n_users} users, {kind}; "
                f"alpha={ALPHA} mc_se={mc_se:.4g}; {base}"
            )
            seed_text = str(seed + 1 if from_aa else seed)
            records.append(
                record(metric_id, f"{metric}_n{r.n_users}", unit, value, n_runs, seed_text, notes)
            )
    return records


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="simkit.validation_run", description=__doc__.splitlines()[0]
    )
    parser.add_argument("--sizes", type=int, nargs="+", default=list(SIZES))
    parser.add_argument("--n-runs", type=int, default=N_RUNS)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="effect runs; A/A: +1")
    parser.add_argument("--lift", type=float, default=DEFAULT_LIFT)
    parser.add_argument("--pr", default="")
    parser.add_argument("--runs-csv", type=Path, default=RUNS_CSV_PATH)
    parser.add_argument("--dry-run", action="store_true", help="print the rows, do not append")
    args = parser.parse_args(argv)
    scenario = build_scenario(relative_lift=args.lift)
    results = run_validation(scenario, args.sizes, args.n_runs, args.seed)
    records = to_run_records(results, scenario, pr=args.pr, git_sha=_git_sha(), seed=args.seed)
    for record in records:
        if not args.dry_run:
            append_run(record, args.runs_csv)
        print(f"{record.metric_id} {record.metric}={record.value:.6g} {record.unit}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
