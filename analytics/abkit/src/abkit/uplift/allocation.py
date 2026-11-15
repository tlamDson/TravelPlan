"""Who to treat under a budget: top-k by uplift (baseline) versus the LP.

Each user ``i`` has a predicted uplift ``u_i`` and a cost ``c_i > 0``. The LP is

    maximize  sum_i u_i x_i   subject to  sum_i c_i x_i <= budget,  0 <= x_i <= 1,

solved by CBC through PuLP (the ``[uplift]`` extra). Top-k treats the highest uplifts
first and stops before the first user that does not fit. ``greedy_allocation`` is the
closed-form optimum of this one-constraint LP (the fractional knapsack: best ``u / c``
first), kept as a check on the solver.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True, eq=False)
class Allocation:
    """``treat`` is each user's share treated, in [0, 1]; ``uplift`` and ``cost`` are the
    planned totals under the predicted uplift and cost."""

    treat: np.ndarray
    uplift: float
    cost: float

    @property
    def n_treated(self) -> int:
        return int(np.count_nonzero(self.treat > 1e-9))


def _check(uplift: np.ndarray, cost: np.ndarray, budget: float):
    uplift = np.asarray(uplift, dtype=np.float64)
    cost = np.asarray(cost, dtype=np.float64)
    if uplift.shape != cost.shape or uplift.ndim != 1:
        raise ValueError(
            f"uplift and cost must be 1-D of the same length: {uplift.shape}, {cost.shape}"
        )
    if not (np.isfinite(uplift).all() and np.isfinite(cost).all()):
        raise ValueError("uplift and cost must be finite")
    if not (cost > 0).all():
        raise ValueError("every cost must be > 0")
    if not (np.isfinite(budget) and budget >= 0):
        raise ValueError(f"budget must be a finite number >= 0, got {budget}")
    return uplift, cost, float(budget)


def _allocation(treat: np.ndarray, uplift: np.ndarray, cost: np.ndarray) -> Allocation:
    return Allocation(treat=treat, uplift=float(treat @ uplift), cost=float(treat @ cost))


def top_k(score: np.ndarray, cost: np.ndarray, budget: float) -> Allocation:
    """Treat the ``k`` highest scores, ``k`` the longest prefix whose cost fits the budget."""
    score, cost, budget = _check(score, cost, budget)
    order = np.argsort(-score, kind="stable")
    k = int(np.searchsorted(np.cumsum(cost[order]), budget * (1 + 1e-12), side="right"))
    treat = np.zeros_like(score)
    treat[order[:k]] = 1.0
    return _allocation(treat, score, cost)


def greedy_allocation(uplift: np.ndarray, cost: np.ndarray, budget: float) -> Allocation:
    """Optimum of the LP: positive uplift only, best ``uplift / cost`` first, the last user
    treated in part so the budget is spent exactly."""
    uplift, cost, budget = _check(uplift, cost, budget)
    treat = np.zeros_like(uplift)
    positive = np.flatnonzero(uplift > 0)
    order = positive[np.argsort(-(uplift[positive] / cost[positive]), kind="stable")]
    spent = np.cumsum(cost[order])
    full = int(np.searchsorted(spent, budget, side="right"))
    treat[order[:full]] = 1.0
    if full < len(order):
        left = budget - (spent[full - 1] if full else 0.0)
        treat[order[full]] = left / cost[order[full]]
    return _allocation(treat, uplift, cost)


def lp_allocation(uplift: np.ndarray, cost: np.ndarray, budget: float) -> Allocation:
    """Solve the budget LP with CBC. Raises ``RuntimeError`` unless CBC reports optimal."""
    uplift, cost, budget = _check(uplift, cost, budget)
    try:
        import pulp
    except ImportError as err:  # pragma: no cover - the [uplift] and [dev] extras install it
        raise ImportError('lp_allocation needs PuLP: pip install "abkit[uplift]"') from err
    problem = pulp.LpProblem("uplift_budget", pulp.LpMaximize)
    x = [pulp.LpVariable(f"x{i}", lowBound=0, upBound=1) for i in range(len(uplift))]
    problem += pulp.LpAffineExpression(zip(x, uplift.tolist(), strict=True))
    problem += pulp.LpAffineExpression(zip(x, cost.tolist(), strict=True)) <= budget
    status = problem.solve(pulp.PULP_CBC_CMD(msg=False))
    if pulp.LpStatus[status] != "Optimal":
        raise RuntimeError(f"CBC did not solve the budget LP: {pulp.LpStatus[status]}")
    treat = np.clip(np.array([v.varValue or 0.0 for v in x]), 0.0, 1.0)
    return _allocation(treat, uplift, cost)
