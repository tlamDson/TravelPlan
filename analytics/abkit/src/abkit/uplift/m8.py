"""M8: extra conversions at the same budget, budget LP versus top-k, on Criteo (B2 plan, PR 20).

    python -m abkit.uplift (--sample NPZ | --raw CSV [--fraction 0.1] [--sample-seed 20]
        [--no-checksum] [--save-sample NPZ]) [--seeds 0,1,2,3,4] [--budgets 0.1,0.2,0.3]
        [--learners t,x] [--test-share 0.3] [--pr 20] [--runs-csv PATH] [--dry-run]

For each seed the sample is split into train and a held-out test share. On train: a
T-learner and an X-learner for conversion, and the cost model ``P(exposure | x)`` fit on
treated rows (Criteo has no price, and an ad is paid when it is shown, so the cost of
treating a user is the chance the ad is actually shown). On test, at a budget of a share
of the expected exposures of treating everyone, top-k (highest predicted uplift first)
and the LP (``abkit.uplift.allocation``) each pick users; their extra conversions are
estimated by inverse propensity on the randomized labels (``abkit.uplift.evaluate``).
Criteo users are real, so the rows are ``simulated=false``. Exit codes: 0 ok, 2 error.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from abkit.bench import _git_sha
from abkit.criteo import CRITEO_SHA256, CriteoSample, draw_sample, load_sample, save_sample
from abkit.runs import RUNS_CSV_PATH, RunRecord, append_run
from abkit.uplift.allocation import lp_allocation, top_k
from abkit.uplift.evaluate import ipw_effects, policy_value
from abkit.uplift.learners import LogisticRegression
from abkit.uplift.meta import TLearner, XLearner

BUDGET_SHARES = (0.1, 0.2, 0.3)
LEARNERS = {"t": TLearner, "x": XLearner}
TEST_SHARE = 0.3
#: Floor on the predicted exposure chance, so the LP's uplift / cost ratio stays bounded.
MIN_COST = 1e-6
PER = 100_000


@dataclass(frozen=True)
class PolicyOutcome:
    seed: int
    learner: str
    budget_share: float
    n_test: int
    budget: float
    topk_planned_uplift: float
    topk_planned_cost: float
    topk_treated: int
    topk_value: float
    topk_spend: float
    lp_planned_uplift: float
    lp_planned_cost: float
    lp_treated: int
    lp_value: float
    lp_spend: float
    random_value: float


def evaluate_seed(
    sample: CriteoSample,
    seed: int,
    budget_shares: Sequence[float] = BUDGET_SHARES,
    learners: Sequence[str] = tuple(LEARNERS),
    test_share: float = TEST_SHARE,
) -> list[PolicyOutcome]:
    """Fit on a seeded train split, allocate and score on the held-out rows."""
    test = np.random.default_rng(seed).random(len(sample)) < test_share
    train = ~test
    x = sample.features.astype(np.float64)
    t = sample.treatment.astype(np.float64)
    y = sample.conversion.astype(np.float64)
    e = sample.exposure.astype(np.float64)
    treated_train = train & (t == 1)
    cost_model = LogisticRegression().fit(x[treated_train], e[treated_train])
    cost = np.maximum(cost_model.predict(x[test]), MIN_COST)
    y_test, t_test, e_test = y[test], t[test], e[test]
    everyone = float(ipw_effects(y_test, t_test).sum())
    outcomes = []
    for name in learners:
        tau = LEARNERS[name]().fit(x[train], t[train], y[train]).predict(x[test])
        for share in budget_shares:
            budget = share * float(cost.sum())
            picks = {"topk": top_k(tau, cost, budget), "lp": lp_allocation(tau, cost, budget)}
            scored = {}
            for key, alloc in picks.items():
                scored |= {
                    f"{key}_planned_uplift": alloc.uplift,
                    f"{key}_planned_cost": alloc.cost,
                    f"{key}_treated": alloc.n_treated,
                    f"{key}_value": policy_value(alloc.treat, y_test, t_test),
                    f"{key}_spend": policy_value(alloc.treat, e_test, t_test),
                }
            outcomes.append(
                PolicyOutcome(
                    seed=seed,
                    learner=name,
                    budget_share=share,
                    n_test=int(test.sum()),
                    budget=budget,
                    random_value=share * everyone,
                    **scored,
                )
            )
    return outcomes


def _per_100k(outcomes: Sequence[PolicyOutcome], attr: str) -> np.ndarray:
    return np.array([getattr(o, attr) / o.n_test * PER for o in outcomes])


def summarize(
    outcomes: Sequence[PolicyOutcome], git_sha: str, pr: str, run_at: str, source: str = ""
) -> list[RunRecord]:
    """Three M8 rows per (learner, budget): top-k and LP extra conversions per 100k test
    users (mean over seeds), and the LP's gain over top-k in percent of top-k."""
    groups: dict[tuple[str, float], list[PolicyOutcome]] = {}
    for o in outcomes:
        groups.setdefault((o.learner, o.budget_share), []).append(o)
    seeds = ",".join(str(s) for s in sorted({o.seed for o in outcomes}))
    records = []
    for (learner, share), group in groups.items():
        topk, lp = _per_100k(group, "topk_value"), _per_100k(group, "lp_value")
        gains = (lp - topk) / np.abs(topk) * 100
        gain = (lp.mean() - topk.mean()) / abs(topk.mean()) * 100
        spend = {
            k: np.mean([getattr(o, f"{k}_spend") / o.budget for o in group]) for k in ("topk", "lp")
        }
        notes = (
            f"seeds={len(group)} learner={learner} budget={share:g} of the expected exposures "
            f"of treating every test user; cost=P(exposure|x) logistic on treated train rows; "
            f"per 100k test users: topk_sd={topk.std(ddof=1) if len(group) > 1 else 0:.2f} "
            f"lp_sd={lp.std(ddof=1) if len(group) > 1 else 0:.2f} "
            f"random={_per_100k(group, 'random_value').mean():.2f}; "
            f"gain_per_seed=[{' '.join(f'{g:.1f}' for g in gains)}]; "
            f"treated topk={np.mean([o.topk_treated for o in group]):.0f} "
            f"lp={np.mean([o.lp_treated for o in group]):.0f}; "
            f"realized spend/budget (IPW) topk={spend['topk']:.3f} lp={spend['lp']:.3f}; {source}"
        ).strip()
        common = {
            "run_at": run_at,
            "git_sha": git_sha,
            "pr": pr,
            "metric_id": "M8",
            "n": round(float(np.mean([o.n_test for o in group]))),
            "seed": seeds,
            "simulated": False,
            "notes": notes,
        }
        suffix = f"{learner}_b{round(share * 100)}"
        unit = "conversions/100k users"
        records += [
            RunRecord(
                metric=f"m8_incremental_conversions_per_100k_topk_{suffix}",
                value=round(float(topk.mean()), 4),
                unit=unit,
                **common,
            ),
            RunRecord(
                metric=f"m8_incremental_conversions_per_100k_lp_{suffix}",
                value=round(float(lp.mean()), 4),
                unit=unit,
                **common,
            ),
            RunRecord(
                metric=f"m8_lp_gain_over_topk_{suffix}",
                value=round(float(gain), 4),
                unit="%",
                **common,
            ),
        ]
    return records


def _floats(text: str) -> list[float]:
    return [float(v) for v in text.split(",") if v.strip()]


def _learners(text: str) -> list[str]:
    names = [n.strip() for n in text.split(",") if n.strip()]
    if not names or set(names) - set(LEARNERS):
        raise argparse.ArgumentTypeError(f"learners must be among {sorted(LEARNERS)}")
    return names


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="abkit.uplift", description=__doc__.splitlines()[0])
    data = parser.add_mutually_exclusive_group(required=True)
    data.add_argument("--sample", type=Path, help="a sample saved by --save-sample")
    data.add_argument("--raw", type=Path, help="the Criteo v2.1 CSV (.csv or .csv.gz)")
    parser.add_argument("--fraction", type=float, default=0.1)
    parser.add_argument("--sample-seed", type=int, default=20)
    parser.add_argument("--no-checksum", action="store_true", help="skip the sha256 check")
    parser.add_argument("--save-sample", type=Path)
    parser.add_argument(
        "--seeds", type=lambda s: [int(v) for v in _floats(s)], default=[0, 1, 2, 3, 4]
    )
    parser.add_argument("--budgets", type=_floats, default=list(BUDGET_SHARES))
    parser.add_argument("--learners", type=_learners, default=list(LEARNERS))
    parser.add_argument("--test-share", type=float, default=TEST_SHARE)
    parser.add_argument("--pr", default="")
    parser.add_argument("--runs-csv", type=Path, default=RUNS_CSV_PATH)
    parser.add_argument("--dry-run", action="store_true", help="print the rows, do not append")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.sample is not None:
            sample = load_sample(args.sample)
        else:
            sha = None if args.no_checksum else CRITEO_SHA256
            sample = draw_sample(args.raw, args.fraction, args.sample_seed, expected_sha256=sha)
            if args.save_sample is not None:
                save_sample(sample, args.save_sample)
        outcomes = []
        for seed in args.seeds:
            outcomes += evaluate_seed(sample, seed, args.budgets, args.learners, args.test_share)
        source = (
            f"sample fraction={sample.fraction:g} sample_seed={sample.seed} "
            f"rows={len(sample)}/{sample.source_rows} sha256={sample.source_sha256[:12]}"
        )
        run_at = datetime.now(UTC).isoformat(timespec="seconds")
        records = summarize(outcomes, _git_sha(), args.pr, run_at, source)
    except (OSError, ValueError, RuntimeError, KeyError) as err:
        print(f"abkit.uplift: {err}", file=sys.stderr)
        return 2
    for record in records:
        if not args.dry_run:
            append_run(record, args.runs_csv)
        print(f"{record.metric}={record.value} {record.unit} (n={record.n})")
    return 0
