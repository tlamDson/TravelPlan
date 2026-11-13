"""Peeking harness: what reading an experiment every day costs (B2 plan, M1 and M3).

Simulates ``n_sims`` experiments on a conversion metric (virtual users, binomial
counts per arm per day) and looks at each one after every day:

- M1, A/A (no effect): how often a fixed-horizon Welch t-test read daily, the
  same test read once at the end, and the mSPRT read daily declare a winner.
- M3, an injected effect: how often the 95% Welch interval covers the true
  effect at the end and at every look, and how often the mSPRT confidence
  sequence covers it at every look.

    python -m abkit.peeking --pr 12 [--n-sims 10000] [--seed N] [--dry-run]
"""

from __future__ import annotations

import argparse
import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from numpy.typing import ArrayLike
from scipy import stats

from abkit.bench import _git_sha
from abkit.runs import RUNS_CSV_PATH, RunRecord, append_run
from abkit.stats import msprt_halfwidth, msprt_likelihood_ratio
from abkit.stats._common import check_alpha

DEFAULT_SEED = 20261113
DEFAULT_EFFECT = 0.003  # +3% relative on a 10% conversion rate (the plan's save_trip lift)


@dataclass(frozen=True)
class PeekingConfig:
    n_sims: int = 10_000
    days: int = 14
    users_per_arm_per_day: int = 200
    baseline_rate: float = 0.10
    #: Absolute lift of the treatment conversion rate; 0 is an A/A test.
    effect: float = 0.0
    #: Prior sd of the mSPRT mixture, on the scale of the rate difference.
    tau: float = 0.01
    alpha: float = 0.05
    seed: int = DEFAULT_SEED

    def __post_init__(self) -> None:
        for name, low in (("n_sims", 1), ("days", 1), ("users_per_arm_per_day", 2)):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, int) or value < low:
                raise ValueError(f"{name} must be an integer >= {low}, got {value!r}")
        if not 0 < self.baseline_rate < 1:
            raise ValueError(f"baseline_rate must be in (0, 1), got {self.baseline_rate!r}")
        if not 0 < self.baseline_rate + self.effect < 1:
            raise ValueError(f"baseline_rate + effect must be in (0, 1), got effect={self.effect}")
        if not (math.isfinite(self.tau) and self.tau > 0):
            raise ValueError(f"tau must be a finite positive number, got {self.tau!r}")
        check_alpha(self.alpha)


@dataclass(frozen=True)
class Looks:
    """Welch statistics after each day (last axis) on the cumulative units."""

    estimate: np.ndarray
    variance: np.ndarray
    df: np.ndarray
    p_value: np.ndarray
    ci_low: np.ndarray
    ci_high: np.ndarray
    n_per_arm: np.ndarray


def cumulative_looks(
    control_successes: ArrayLike,
    treatment_successes: ArrayLike,
    users_per_arm_per_day: int,
    alpha: float = 0.05,
) -> Looks:
    """Daily success counts per arm in, two-sided Welch on the 0/1 units so far out.

    A look where both arms have zero variance carries no evidence: p = 1 and a
    zero-width interval at the estimate.
    """
    alpha = check_alpha(alpha)
    sc = np.cumsum(np.asarray(control_successes, dtype=np.float64), axis=-1)
    st = np.cumsum(np.asarray(treatment_successes, dtype=np.float64), axis=-1)
    n = users_per_arm_per_day * np.arange(1, sc.shape[-1] + 1, dtype=np.float64)
    pc, pt = sc / n, st / n
    # Var of a mean of 0/1 values with ddof=1: p(1 - p) / (n - 1).
    vc, vt = pc * (1 - pc) / (n - 1), pt * (1 - pt) / (n - 1)
    variance = vc + vt
    informative = variance > 0
    safe = np.where(informative, variance, 1.0)
    df_denominator = np.where(informative, (vc**2 + vt**2) / (n - 1), 1.0)
    df = np.where(informative, safe**2 / df_denominator, 2 * (n - 1))
    estimate = pt - pc
    statistic = np.where(informative, estimate / np.sqrt(safe), 0.0)
    half = stats.t.ppf(1 - alpha / 2, df) * np.sqrt(variance)
    return Looks(
        estimate=estimate,
        variance=variance,
        df=df,
        p_value=np.where(informative, 2 * stats.t.sf(np.abs(statistic), df), 1.0),
        ci_low=estimate - half,
        ci_high=estimate + half,
        n_per_arm=n.astype(np.int64),
    )


def _msprt_paths(looks: Looks, tau: float, alpha: float) -> tuple[np.ndarray, ...]:
    """Always-valid p and confidence sequence; uninformative looks change nothing."""
    informative = looks.variance > 0
    safe = np.where(informative, looks.variance, 1.0)
    lr = np.where(informative, msprt_likelihood_ratio(looks.estimate, safe, tau), 1.0)
    half = np.where(informative, msprt_halfwidth(safe, tau, alpha), np.inf)
    with np.errstate(divide="ignore"):
        p = np.minimum.accumulate(np.minimum(1.0, 1.0 / lr), axis=-1)
    low = np.maximum.accumulate(looks.estimate - half, axis=-1)
    high = np.minimum.accumulate(looks.estimate + half, axis=-1)
    return p, low, high


@dataclass(frozen=True)
class PeekingResult:
    config: PeekingConfig
    ttest_fixed_reject_rate: float
    ttest_peek_reject_rate: float
    msprt_peek_reject_rate: float
    welch_fixed_coverage: float
    welch_all_peeks_coverage: float
    msprt_all_peeks_coverage: float


def simulate_peeking(config: PeekingConfig) -> PeekingResult:
    rng = np.random.default_rng(config.seed)
    shape = (config.n_sims, config.days)
    users = config.users_per_arm_per_day
    control = rng.binomial(users, config.baseline_rate, size=shape)
    treatment = rng.binomial(users, config.baseline_rate + config.effect, size=shape)
    looks = cumulative_looks(control, treatment, users, config.alpha)
    msprt_p, cs_low, cs_high = _msprt_paths(looks, config.tau, config.alpha)
    truth = config.effect
    welch_covers = (looks.ci_low <= truth) & (truth <= looks.ci_high)
    ttest_rejects = looks.p_value < config.alpha

    def rate(hits: np.ndarray) -> float:
        return float(hits.mean())

    return PeekingResult(
        config=config,
        ttest_fixed_reject_rate=rate(ttest_rejects[:, -1]),
        ttest_peek_reject_rate=rate(ttest_rejects.any(axis=-1)),
        msprt_peek_reject_rate=rate(msprt_p[:, -1] < config.alpha),
        welch_fixed_coverage=rate(welch_covers[:, -1]),
        welch_all_peeks_coverage=rate(welch_covers.all(axis=-1)),
        msprt_all_peeks_coverage=rate((cs_low[:, -1] <= truth) & (truth <= cs_high[:, -1])),
    )


_M1 = (
    ("fpr_ttest_fixed_horizon", "ttest_fixed_reject_rate"),
    ("fpr_ttest_daily_peek", "ttest_peek_reject_rate"),
    ("fpr_msprt_daily_peek", "msprt_peek_reject_rate"),
)
_M3 = (
    ("ci95_coverage_welch_fixed_horizon", "welch_fixed_coverage"),
    ("ci95_coverage_welch_all_peeks", "welch_all_peeks_coverage"),
    ("cs95_coverage_msprt_all_peeks", "msprt_all_peeks_coverage"),
)


def _notes(c: PeekingConfig, value: float) -> str:
    mc_se = math.sqrt(value * (1 - value) / c.n_sims)
    return (
        f"virtual users; {c.n_sims} simulated experiments x {c.days} daily looks; "
        f"users_per_arm_per_day={c.users_per_arm_per_day} baseline_rate={c.baseline_rate} "
        f"effect={c.effect} tau={c.tau} alpha={c.alpha} mc_se={mc_se:.4f}"
    )


def to_run_records(
    aa: PeekingResult, with_effect: PeekingResult, pr: str, git_sha: str
) -> list[RunRecord]:
    """M1 rows from the A/A run, M3 rows from the injected-effect run."""
    run_at = datetime.now(UTC).isoformat(timespec="seconds")
    records = []
    for metric_id, result, metrics in (("M1", aa, _M1), ("M3", with_effect, _M3)):
        for metric, attr in metrics:
            value = getattr(result, attr)
            records.append(
                RunRecord(
                    run_at=run_at,
                    git_sha=git_sha,
                    pr=pr,
                    metric_id=metric_id,
                    metric=metric,
                    value=value,
                    unit="proportion",
                    n=result.config.n_sims,
                    seed=str(result.config.seed),
                    simulated=True,
                    notes=_notes(result.config, value),
                )
            )
    return records


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="abkit.peeking", description=__doc__.splitlines()[0])
    parser.add_argument("--n-sims", type=int, default=PeekingConfig.n_sims)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="A/A seed; effect: +1")
    parser.add_argument("--effect", type=float, default=DEFAULT_EFFECT)
    parser.add_argument("--pr", default="")
    parser.add_argument("--runs-csv", type=Path, default=RUNS_CSV_PATH)
    parser.add_argument("--dry-run", action="store_true", help="print the rows, do not append")
    args = parser.parse_args(argv)
    aa = simulate_peeking(PeekingConfig(n_sims=args.n_sims, seed=args.seed))
    with_effect = simulate_peeking(
        PeekingConfig(n_sims=args.n_sims, effect=args.effect, seed=args.seed + 1)
    )
    records = to_run_records(aa, with_effect, pr=args.pr, git_sha=_git_sha())
    for record in records:
        if not args.dry_run:
            append_run(record, args.runs_csv)
        print(f"{record.metric_id} {record.metric}={record.value:.4f} ({record.notes})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
