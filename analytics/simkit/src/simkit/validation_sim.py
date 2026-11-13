"""Validation of abkit on SIMULATED experiments with a known injected effect (B2 plan, PR 14).

Every virtual user draws a persona (``simkit.personas`` weights), an arm (50/50) and one
Bernoulli outcome: did their exposed session reach ``trip_saved``? The control rate of each
persona is exact, from its Markov chain (``simkit.conversion``). The treatment multiplies it by
``1 + c * multiplier[persona]``, with ``c`` chosen so the population save rate rises by exactly
``relative_lift`` (+3% by default). The truth per persona is therefore known in closed form,
and abkit (Welch for the ATE, ``cate_by_group`` per persona) never sees it.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass, replace

import numpy as np
from abkit.stats import cate_by_group, power_proportions, welch_ttest
from abkit.stats._common import check_alpha

from simkit._common import check_int
from simkit.conversion import save_probability
from simkit.personas import PERSONAS

DEFAULT_LIFT = 0.03
#: Relative lift of each persona, up to the common factor ``c``: heavier users gain more.
PERSONA_MULTIPLIERS: Mapping[str, float] = {"browser": 0.5, "planner": 1.0, "power": 2.0}
MIN_USERS = 100


@dataclass(frozen=True)
class Scenario:
    names: tuple[str, ...]
    weights: tuple[float, ...]
    p_control: tuple[float, ...]
    p_treatment: tuple[float, ...]
    relative_lift: float

    @property
    def truth(self) -> tuple[float, ...]:
        """True CATE of each persona: p_treatment - p_control."""
        return tuple(p1 - p0 for p0, p1 in zip(self.p_control, self.p_treatment, strict=True))

    @property
    def p_control_all(self) -> float:
        return math.fsum(w * p for w, p in zip(self.weights, self.p_control, strict=True))

    @property
    def p_treatment_all(self) -> float:
        return math.fsum(w * p for w, p in zip(self.weights, self.p_treatment, strict=True))

    @property
    def ate(self) -> float:
        return self.p_treatment_all - self.p_control_all

    def null(self) -> Scenario:
        """The A/A version: same users, no effect."""
        return replace(self, p_treatment=self.p_control, relative_lift=0.0)


def build_scenario(
    relative_lift: float = DEFAULT_LIFT,
    multipliers: Mapping[str, float] = PERSONA_MULTIPLIERS,
) -> Scenario:
    if not (math.isfinite(relative_lift) and relative_lift > -1):
        raise ValueError(f"relative_lift must be a finite number > -1, got {relative_lift!r}")
    names = tuple(p.name for p in PERSONAS)
    missing = [n for n in names if n not in multipliers]
    if missing or set(multipliers) - set(names):
        raise ValueError(f"multipliers need exactly the personas {names}; missing {missing}")
    m = np.array([multipliers[n] for n in names], dtype=np.float64)
    if np.any(m < 0) or not np.any(m > 0):
        raise ValueError(f"multipliers must be >= 0 and not all 0, got {dict(multipliers)}")
    weights = np.array([p.weight for p in PERSONAS]) / math.fsum(p.weight for p in PERSONAS)
    p0 = np.array([save_probability(p) for p in PERSONAS])
    c = relative_lift * float(weights @ p0) / float(weights @ (p0 * m))
    p1 = p0 * (1 + c * m)
    if np.any(p1 <= 0) or np.any(p1 >= 1):
        raise ValueError(f"relative_lift={relative_lift} gives a treatment rate outside (0, 1)")
    return Scenario(names, tuple(weights), tuple(p0), tuple(p1), float(relative_lift))


@dataclass(frozen=True)
class Runs:
    """abkit's output on each simulated experiment (one row per experiment)."""

    n_users: int
    alpha: float
    ate: np.ndarray
    ate_low: np.ndarray
    ate_high: np.ndarray
    ate_p: np.ndarray
    cate: np.ndarray  # (n_runs, personas), in ``Scenario.names`` order
    cate_low: np.ndarray
    cate_high: np.ndarray
    q_p: np.ndarray  # Cochran's Q p-value: do the persona effects differ?


def simulate_runs(
    scenario: Scenario, n_users: int, n_runs: int, seed: int, alpha: float = 0.05
) -> Runs:
    check_int("n_users", n_users, MIN_USERS)
    check_int("n_runs", n_runs, 2)
    alpha = check_alpha(alpha)
    rng = np.random.default_rng([seed, n_users])
    weights = np.array(scenario.weights)
    p0, p1 = np.array(scenario.p_control), np.array(scenario.p_treatment)
    k = len(scenario.names)
    ate = np.empty((4, n_runs))
    cate, q_p = np.empty((3, n_runs, k)), np.empty(n_runs)
    for run in range(n_runs):
        persona = rng.choice(k, size=n_users, p=weights)
        treated = rng.random(n_users) < 0.5
        y = (rng.random(n_users) < np.where(treated, p1[persona], p0[persona])).astype(float)
        w = welch_ttest(y[~treated], y[treated], alpha=alpha)
        ate[:, run] = w.estimate, w.ci_low, w.ci_high, w.p_value
        result = cate_by_group(y, treated, persona, alpha=alpha)
        for j in range(k):
            g = result.effect(str(j))
            cate[:, run, j] = g.estimate, g.ci_low, g.ci_high
        q_p[run] = result.q_p_value
    return Runs(n_users, alpha, *ate, *cate, q_p)


@dataclass(frozen=True)
class Summary:
    n_users: int
    n_runs: int
    reject_rate: float  # empirical power of Welch (A/A: false positive rate)
    analytic_power: float  # two-proportion z-test at the population rates, n_users / 2 per arm
    ate_bias: float
    ate_bias_se: float  # Monte Carlo standard error of ``ate_bias``
    ate_coverage: float
    cate_bias: tuple[float, ...]
    cate_bias_se: tuple[float, ...]
    cate_coverage: tuple[float, ...]
    cate_rmse: tuple[float, ...]
    cate_rmse_se: tuple[float, ...]  # delta method: se(mean squared error) / (2 rmse)
    heterogeneity_reject_rate: float
    #: Share of runs that order the persona effects as the truth does; None when the truth ties.
    rank_accuracy: float | None


def summarize(scenario: Scenario, runs: Runs) -> Summary:
    n_runs = runs.ate.size
    truth = np.array(scenario.truth)
    errors = runs.cate - truth

    def covered(low: np.ndarray, high: np.ndarray, value) -> np.ndarray:
        return ((low <= value) & (value <= high)).mean(axis=0)

    squared = errors**2
    rmse = np.sqrt(squared.mean(axis=0))
    rmse_se = squared.std(axis=0, ddof=1) / math.sqrt(n_runs) / (2 * rmse)
    rank = None
    if np.unique(truth).size == truth.size:
        rank = float((np.argsort(runs.cate, axis=1) == np.argsort(truth)).all(axis=1).mean())
    return Summary(
        n_users=runs.n_users,
        n_runs=n_runs,
        reject_rate=float((runs.ate_p < runs.alpha).mean()),
        analytic_power=power_proportions(
            scenario.p_control_all, scenario.p_treatment_all, runs.n_users / 2, alpha=runs.alpha
        ),
        ate_bias=float(runs.ate.mean() - scenario.ate),
        ate_bias_se=float(runs.ate.std(ddof=1) / math.sqrt(n_runs)),
        ate_coverage=float(covered(runs.ate_low, runs.ate_high, scenario.ate)),
        cate_bias=tuple(float(b) for b in errors.mean(axis=0)),
        cate_bias_se=tuple(float(s) for s in runs.cate.std(axis=0, ddof=1) / math.sqrt(n_runs)),
        cate_coverage=tuple(float(c) for c in covered(runs.cate_low, runs.cate_high, truth)),
        cate_rmse=tuple(float(r) for r in rmse),
        cate_rmse_se=tuple(float(s) for s in rmse_se),
        heterogeneity_reject_rate=float((runs.q_p < runs.alpha).mean()),
        rank_accuracy=rank,
    )
