"""Fit the nuisance models from data columns and run one estimator (golden cases, M6)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np

from abkit.causal.design import design_matrix
from abkit.causal.estimators import CausalResult, aipw, ipw, naive_diff
from abkit.causal.models import check_binary, fit_logit, fit_ols

METHODS = ("naive_diff", "ipw", "aipw")


def propensity_scores(
    columns: Mapping[str, np.ndarray], terms: Sequence[str], treatment: str = "treatment"
) -> np.ndarray:
    """Logistic P(T=1 | X) with an intercept plus ``terms``."""
    t = check_binary(treatment, columns[treatment])
    return fit_logit(design_matrix(columns, terms), t).probabilities


def outcome_predictions(
    columns: Mapping[str, np.ndarray],
    terms: Sequence[str],
    outcome: str,
    arm: int,
    treatment: str = "treatment",
) -> np.ndarray:
    """OLS of ``outcome`` on ``terms`` fitted on one arm, predicted for every unit."""
    x = design_matrix(columns, terms)
    in_arm = check_binary(treatment, columns[treatment]) == arm
    coef = fit_ols(x[in_arm], np.asarray(columns[outcome], dtype=np.float64)[in_arm])
    return x @ coef


def estimate_effect(
    columns: Mapping[str, np.ndarray],
    method: str,
    *,
    outcome: str,
    treatment: str = "treatment",
    propensity_terms: Sequence[str] = (),
    outcome_terms: Sequence[str] = (),
    estimand: str = "ate",
    alpha: float = 0.05,
    se_type: str = "welch",
) -> CausalResult:
    """``naive_diff`` ignores the terms; ``ipw`` uses ``propensity_terms``; ``aipw`` both."""
    if method not in METHODS:
        raise ValueError(f"method must be one of {METHODS}, got {method!r}")
    for name in (outcome, treatment):
        if name not in columns:
            raise ValueError(f"unknown column {name!r}; have {sorted(columns)}")
    y, t = columns[outcome], columns[treatment]
    if method == "naive_diff":
        return naive_diff(y, t, alpha=alpha, se_type=se_type)
    e = propensity_scores(columns, propensity_terms, treatment)
    if method == "ipw":
        return ipw(y, t, e, estimand=estimand, alpha=alpha)
    mu0 = outcome_predictions(columns, outcome_terms, outcome, 0, treatment)
    mu1 = None
    if estimand == "ate":
        mu1 = outcome_predictions(columns, outcome_terms, outcome, 1, treatment)
    return aipw(y, t, e, mu0, mu1, estimand=estimand, alpha=alpha)
