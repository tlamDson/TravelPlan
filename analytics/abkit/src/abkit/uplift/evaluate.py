"""Off-policy value on randomized data, and per-arm summary rates.

On a randomized test with treatment probability ``p``, the inverse-propensity term
``y * (t / p - (1 - t) / (1 - p))`` has expectation ``tau(x)`` for each user, so the sum of
``policy_i`` times it is an unbiased estimate of the extra outcomes a policy that treats
user ``i`` with probability ``policy_i`` gains over treating nobody. With ``p`` the
observed treatment share, treating everyone gives exactly ``n * (mean_t - mean_c)``.
"""

from __future__ import annotations

from collections.abc import Mapping

import numpy as np


def ipw_effects(
    y: np.ndarray, treatment: np.ndarray, propensity: float | None = None
) -> np.ndarray:
    y = np.asarray(y, dtype=np.float64)
    t = np.asarray(treatment, dtype=np.float64)
    if y.shape != t.shape:
        raise ValueError(f"y and treatment need the same length: {y.shape}, {t.shape}")
    if not np.isin(t, (0.0, 1.0)).all() or t.min() == t.max():
        raise ValueError("treatment must be 0/1 with both arms present")
    p = t.mean() if propensity is None else float(propensity)
    if not 0.0 < p < 1.0:
        raise ValueError(f"propensity must be in (0, 1), got {p}")
    return y * (t / p - (1 - t) / (1 - p))


def policy_value(
    policy: np.ndarray,
    y: np.ndarray,
    treatment: np.ndarray,
    propensity: float | None = None,
) -> float:
    """Estimated extra outcomes of ``policy`` (share of each user treated) over no one."""
    policy = np.asarray(policy, dtype=np.float64)
    if policy.shape != np.shape(y):
        raise ValueError(f"policy and y need the same length: {policy.shape}, {np.shape(y)}")
    if not ((policy >= 0) & (policy <= 1)).all():
        raise ValueError("policy must be a share in [0, 1] for every user")
    return float(policy @ ipw_effects(y, treatment, propensity))


def arm_summary(counts: Mapping[str, Mapping[str, float]]) -> dict[str, float]:
    """Rates and lifts from per-arm totals ``{arm: {n, visit, conversion}}``."""
    for arm in ("control", "treatment"):
        if arm not in counts:
            raise ValueError(f"counts need a {arm!r} arm")
        if not counts[arm]["n"] > 0:
            raise ValueError(f"{arm}: n must be > 0")
    c, t = counts["control"], counts["treatment"]
    n_total = c["n"] + t["n"]
    out: dict[str, float] = {"n_total": n_total, "treatment_ratio": t["n"] / n_total}
    for label in ("visit", "conversion"):
        rate_c, rate_t = c[label] / c["n"], t[label] / t["n"]
        out[f"{label}_rate"] = (c[label] + t[label]) / n_total
        out[f"ate_{label}"] = rate_t - rate_c
        if rate_c > 0:
            out[f"relative_uplift_{label}"] = (rate_t - rate_c) / rate_c
    return out
