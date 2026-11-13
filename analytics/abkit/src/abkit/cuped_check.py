"""Check CUPED's ``1 / (1 - R²)`` promise on Hillstrom with a bootstrap; log M4.

    python -m abkit.cuped_check D:/data/b2/hillstrom.csv --pr 11 [--n-boot 1000] [--dry-run]

Mens E-Mail is compared with No E-Mail for each outcome in
``HILLSTROM_OUTCOMES``, adjusted by its pre-period covariate. Users are
resampled within each arm ``n_boot`` times; the variance of the CUPED
estimate over the variance of the unadjusted one should be ``1 - R²``.
Three rows per outcome go to ``analytics/runs/runs.csv`` (metric M4, real
users, not simulated).
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from numpy.typing import ArrayLike

from abkit import hillstrom
from abkit.bench import _git_sha
from abkit.runs import RUNS_CSV_PATH, RunRecord, append_run
from abkit.stats import cuped

#: Outcome -> pre-period covariate. Recency is the strongest single covariate of visit,
#: history (past-year spend) of spend; both are weak (R² below 1%).
HILLSTROM_OUTCOMES = {"visit": "recency", "spend": "history"}
#: Replicate pairs are resampled this many times for the interval of the variance ratio.
_RATIO_RESAMPLES = 2000


@dataclass(frozen=True)
class CupedBootstrap:
    n_boot: int
    seed: int
    variance_reduction: float
    #: ``1 - R²`` on the full sample, i.e. ``1 / sample_size_multiplier``.
    predicted_variance_ratio: float
    #: var(CUPED estimate) / var(unadjusted estimate) over the replicates.
    bootstrap_variance_ratio: float
    ratio_ci_low: float
    ratio_ci_high: float
    bootstrap_se_cuped: float
    analytic_se_cuped: float
    #: Mean of (CUPED estimate - unadjusted estimate) over the replicates.
    mean_shift: float


def bootstrap_cuped(
    y_control: ArrayLike,
    x_control: ArrayLike,
    y_treatment: ArrayLike,
    x_treatment: ArrayLike,
    n_boot: int = 1000,
    seed: int = 0,
) -> CupedBootstrap:
    """Resample users within each arm and rerun ``abkit.stats.cuped`` on each replicate."""
    if isinstance(n_boot, bool) or not isinstance(n_boot, int) or n_boot < 2:
        raise ValueError(f"n_boot must be an integer >= 2, got {n_boot!r}")
    y_c, x_c = np.asarray(y_control, float), np.asarray(x_control, float)
    y_t, x_t = np.asarray(y_treatment, float), np.asarray(x_treatment, float)
    full = cuped(y_c, x_c, y_t, x_t)
    rng = np.random.default_rng(seed)
    naive, adjusted = np.empty(n_boot), np.empty(n_boot)
    for b in range(n_boot):
        ic, it = rng.integers(0, y_c.size, y_c.size), rng.integers(0, y_t.size, y_t.size)
        res = cuped(y_c[ic], x_c[ic], y_t[it], x_t[it])
        naive[b], adjusted[b] = res.naive_estimate, res.estimate
    ratio = float(adjusted.var(ddof=1) / naive.var(ddof=1))
    pairs = rng.integers(0, n_boot, (_RATIO_RESAMPLES, n_boot))
    ratios = adjusted[pairs].var(axis=1, ddof=1) / naive[pairs].var(axis=1, ddof=1)
    low, high = np.quantile(ratios, [0.025, 0.975])
    return CupedBootstrap(
        n_boot=n_boot,
        seed=seed,
        variance_reduction=full.variance_reduction,
        predicted_variance_ratio=1.0 / full.sample_size_multiplier,
        bootstrap_variance_ratio=ratio,
        ratio_ci_low=float(low),
        ratio_ci_high=float(high),
        bootstrap_se_cuped=float(adjusted.std(ddof=1)),
        analytic_se_cuped=full.se,
        mean_shift=float(np.mean(adjusted - naive)),
    )


def hillstrom_runs(
    path: Path,
    n_boot: int = 1000,
    seed: int = 11,
    pr: str = "",
    git_sha: str | None = None,
    expected_sha256: str | None = hillstrom.HILLSTROM_SHA256,
) -> list[RunRecord]:
    """Bootstrap each outcome of Mens E-Mail vs No E-Mail; three M4 rows per outcome."""
    arms = hillstrom.two_arms(
        hillstrom.load_hillstrom(path, expected_sha256), treatment="Mens E-Mail"
    )
    is_t = arms["variant"] == "treatment"
    run_at = datetime.now(UTC).isoformat(timespec="seconds")
    sha = git_sha or _git_sha()
    records = []
    for outcome, covariate in HILLSTROM_OUTCOMES.items():
        y, x = arms[outcome].astype(float), arms[covariate].astype(float)
        boot = bootstrap_cuped(y[~is_t], x[~is_t], y[is_t], x[is_t], n_boot=n_boot, seed=seed)
        base = f"hillstrom mens-vs-none outcome={outcome} covariate={covariate}"
        values = [
            ("variance_reduction", boot.variance_reduction, "fraction", f"{base} R^2 pooled"),
            (
                "sample_size_multiplier",
                1.0 / boot.predicted_variance_ratio,
                "x",
                f"{base} 1/(1-R^2)",
            ),
            (
                "bootstrap_variance_ratio",
                boot.bootstrap_variance_ratio,
                "ratio",
                f"{base} n_boot={n_boot} predicted={boot.predicted_variance_ratio:.6f} "
                f"ci95=[{boot.ratio_ci_low:.6f},{boot.ratio_ci_high:.6f}] "
                f"se_boot={boot.bootstrap_se_cuped:.6g} se_analytic={boot.analytic_se_cuped:.6g}",
            ),
        ]
        for what, value, unit, notes in values:
            records.append(
                RunRecord(
                    run_at=run_at,
                    git_sha=sha,
                    pr=pr,
                    metric_id="M4",
                    metric=f"hillstrom_{outcome}_cuped_{what}",
                    value=float(value),
                    unit=unit,
                    n=int(y.size),
                    seed=str(seed),
                    simulated=False,
                    notes=notes,
                )
            )
    return records


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="abkit.cuped_check", description=__doc__.splitlines()[0])
    parser.add_argument("path", type=Path, help="raw Hillstrom CSV")
    parser.add_argument("--n-boot", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=11)
    parser.add_argument("--pr", default="")
    parser.add_argument("--runs-csv", type=Path, default=RUNS_CSV_PATH)
    parser.add_argument("--dry-run", action="store_true", help="print the rows, do not append")
    args = parser.parse_args(argv)
    records = hillstrom_runs(
        args.path,
        n_boot=args.n_boot,
        seed=args.seed,
        pr=args.pr,
        expected_sha256=hillstrom.HILLSTROM_SHA256,
    )
    for record in records:
        if not args.dry_run:
            append_run(record, args.runs_csv)
        print(f"{record.metric}={record.value:.6g} {record.unit} ({record.notes})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
