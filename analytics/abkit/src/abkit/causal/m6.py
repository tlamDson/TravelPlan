"""M6: ATE error of naive, IPW and AIPW against an experimental benchmark (B2 plan, PR 17).

    python -m abkit.causal.m6 --hillstrom D:/data/b2/hillstrom/hillstrom.csv --pr 17
        [--reps 100] [--seed 0] [--strength 1.0] [--runs PATH] [--dry-run]

Hillstrom: ``--reps`` biased resamples of the real RCT (``abkit.causal.hillstrom``); the
benchmark is the full-RCT difference in means. LaLonde: each method on NSW treated + PSID-1
controls (the committed G-public cases), against the published experimental $1,794.
Rows go to ``analytics/runs/runs.csv`` with ``metric_id`` M6; both use real people, so
``simulated`` is false (the Hillstrom selection is synthetic, the users are not).
"""

from __future__ import annotations

import argparse
import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from abkit.bench import _git_sha
from abkit.causal.estimators import CausalResult
from abkit.causal.fit import METHODS, estimate_effect
from abkit.causal.hillstrom import HILLSTROM_COVARIATES, biased_sample, load_hillstrom
from abkit.golden.case import load_case
from abkit.runs import RUNS_CSV_PATH, RunRecord, append_run

GOLDEN_ROOT = Path(__file__).resolve().parents[4] / "golden/v2"
LALONDE_BENCHMARK_CASE = "public/lalonde-experimental"
LALONDE_CASES = {m: f"public/lalonde-psid-{m.split('_')[0]}" for m in METHODS}


@dataclass(frozen=True)
class Study:
    benchmark: float
    reps: int
    seed: int
    strength: float
    n_population: int
    mean_kept: float
    estimates: dict[str, list[CausalResult]]


@dataclass(frozen=True)
class MethodSummary:
    method: str
    bias: float
    rmse: float
    mean_abs_error: float
    #: Share of 95% CIs that contain the benchmark.
    coverage: float


def _effect(data: dict[str, np.ndarray], method: str) -> CausalResult:
    terms = HILLSTROM_COVARIATES
    return estimate_effect(
        data, method, outcome="outcome", propensity_terms=terms, outcome_terms=terms
    )


def replicate(
    data: dict[str, np.ndarray], reps: int = 100, seed: int = 0, strength: float = 1.0
) -> Study:
    """Run every method on ``reps`` biased resamples drawn from one seeded generator."""
    if reps < 1:
        raise ValueError(f"reps must be >= 1, got {reps}")
    t, y = data["treatment"], data["outcome"]
    benchmark = float(y[t == 1].mean() - y[t == 0].mean())
    rng = np.random.default_rng(seed)
    estimates: dict[str, list[CausalResult]] = {m: [] for m in METHODS}
    kept = []
    for _ in range(reps):
        keep = biased_sample(data, rng, strength)
        sample = {name: values[keep] for name, values in data.items()}
        kept.append(int(keep.sum()))
        for method in METHODS:
            estimates[method].append(_effect(sample, method))
    return Study(benchmark, reps, seed, strength, int(t.size), float(np.mean(kept)), estimates)


def summarize(study: Study) -> list[MethodSummary]:
    summaries = []
    for method, results in study.estimates.items():
        errors = np.array([r.estimate for r in results]) - study.benchmark
        covered = [r.ci_low <= study.benchmark <= r.ci_high for r in results]
        summaries.append(
            MethodSummary(
                method=method,
                bias=float(errors.mean()),
                rmse=math.sqrt(float(np.mean(errors**2))),
                mean_abs_error=float(np.abs(errors).mean()),
                coverage=float(np.mean(covered)),
            )
        )
    return summaries


def hillstrom_records(
    study: Study, pr: str, git_sha: str, run_at: str, label: str = "Womens E-Mail, visit"
) -> list[RunRecord]:
    notes = (
        f"Hillstrom RCT ({label}) vs No E-Mail; real users, synthetic covariate selection "
        f"strength={study.strength}; {study.reps} biased resamples keeping "
        f"{study.mean_kept:.0f}/{study.n_population} rows on average; error vs the full-RCT "
        "difference in means; IPW/AIPW logit and OLS on the 9 Hillstrom covariates; "
        "CI coverage is of that benchmark, which shares about half its rows with each "
        "resample, so it overstates coverage of a population ATE"
    )

    def row(metric: str, value: float, unit: str) -> RunRecord:
        return RunRecord(
            run_at=run_at,
            git_sha=git_sha,
            pr=pr,
            metric_id="M6",
            metric=metric,
            value=value,
            unit=unit,
            n=study.reps,
            seed=str(study.seed),
            simulated=False,
            notes=notes,
        )

    records = [row("hillstrom_ate_benchmark", 100 * study.benchmark, "pp")]
    for s in summarize(study):
        records.append(row(f"hillstrom_ate_bias_{s.method}", 100 * s.bias, "pp"))
        records.append(row(f"hillstrom_ate_rmse_{s.method}", 100 * s.rmse, "pp"))
        records.append(
            row(f"hillstrom_ate_mean_abs_error_{s.method}", 100 * s.mean_abs_error, "pp")
        )
        records.append(row(f"hillstrom_ate_ci95_coverage_{s.method}", s.coverage, "share"))
    return records


def lalonde_records(golden_root: Path, pr: str, git_sha: str, run_at: str) -> list[RunRecord]:
    """Each method on the committed NSW + PSID-1 case, minus the published experimental ATT."""
    benchmark = load_case(Path(golden_root) / LALONDE_BENCHMARK_CASE).expected["estimate"]
    records = []
    for method, case_id in LALONDE_CASES.items():
        case = load_case(Path(golden_root) / case_id)
        params = dict(case.params)
        params.pop("alpha", None)
        result = estimate_effect(case.read_data(), method, **params)
        records.append(
            RunRecord(
                run_at=run_at,
                git_sha=git_sha,
                pr=pr,
                metric_id="M6",
                metric=f"lalonde_psid_att_error_{method}",
                value=result.estimate - benchmark,
                unit="USD",
                n=result.n_treated + result.n_control,
                seed="",
                simulated=False,
                notes=(
                    f"LaLonde NSW treated + PSID-1 controls ({case_id}); estimate "
                    f"{result.estimate:.2f} minus the published experimental {benchmark} "
                    "(Dehejia & Wahba 1999)"
                ),
            )
        )
    return records


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m abkit.causal.m6", description=__doc__)
    parser.add_argument("--hillstrom", type=Path, required=True, help="raw Hillstrom CSV")
    parser.add_argument("--reps", type=int, default=100)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--strength", type=float, default=1.0)
    parser.add_argument("--pr", default="")
    parser.add_argument("--golden", type=Path, default=GOLDEN_ROOT)
    parser.add_argument("--runs", type=Path, default=RUNS_CSV_PATH)
    parser.add_argument("--dry-run", action="store_true", help="print rows, do not append them")
    args = parser.parse_args(argv)
    study = replicate(load_hillstrom(args.hillstrom), args.reps, args.seed, args.strength)
    run_at, sha = datetime.now(UTC).isoformat(timespec="seconds"), _git_sha()
    records = hillstrom_records(study, args.pr, sha, run_at)
    records += lalonde_records(args.golden, args.pr, sha, run_at)
    for record in records:
        if not args.dry_run:
            append_run(record, args.runs)
        print(f"{record.metric}={record.value:.6g} {record.unit} (n={record.n})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
