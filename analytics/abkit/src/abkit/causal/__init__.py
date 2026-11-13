"""Causal estimators for observational data: naive, IPW, AIPW (B2 plan, PR 17).

Checked two ways: M6 resamples the Hillstrom RCT with covariate-driven selection
(``abkit.causal.m6``), and the G-public LaLonde NSW golden cases hold the published
experimental ATT as the benchmark for the observational estimates.
"""

from abkit.causal.design import design_matrix
from abkit.causal.estimators import CausalResult, aipw, ipw, naive_diff
from abkit.causal.fit import estimate_effect, outcome_predictions, propensity_scores
from abkit.causal.models import LogitFit, fit_logit, fit_ols, predict_logit

__all__ = [
    "CausalResult",
    "LogitFit",
    "aipw",
    "design_matrix",
    "estimate_effect",
    "fit_logit",
    "fit_ols",
    "ipw",
    "naive_diff",
    "outcome_predictions",
    "predict_logit",
    "propensity_scores",
]
