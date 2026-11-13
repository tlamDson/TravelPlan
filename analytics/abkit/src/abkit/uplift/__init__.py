"""Uplift modeling and budget allocation (B2 plan, PR 20).

T-learner and X-learner over NumPy base learners, the budget LP (PuLP + CBC, the
``[uplift]`` extra) against top-k, and off-policy value on randomized data.
"""

from abkit.uplift.allocation import Allocation, greedy_allocation, lp_allocation, top_k
from abkit.uplift.evaluate import arm_summary, ipw_effects, policy_value
from abkit.uplift.learners import LogisticRegression, RidgeRegression
from abkit.uplift.meta import TLearner, XLearner

__all__ = [
    "Allocation",
    "LogisticRegression",
    "RidgeRegression",
    "TLearner",
    "XLearner",
    "arm_summary",
    "greedy_allocation",
    "ipw_effects",
    "lp_allocation",
    "policy_value",
    "top_k",
]
