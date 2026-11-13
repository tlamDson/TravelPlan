"""Synthetic staggered-adoption panels with a known effect for the DiD tests."""

from __future__ import annotations

from collections.abc import Callable, Mapping

import numpy as np

from abkit.did.panel import NEVER, DidPanel

Effect = Callable[[int, int], float]


def staggered_panel(
    sizes: Mapping[int, int],
    periods: int,
    effect: Effect = lambda cohort, rel: 0.0,
    *,
    pre_slope: float = 0.0,
    noise: float = 1.0,
    missing: float = 0.0,
    seed: int = 0,
) -> DidPanel:
    """``sizes`` maps a cohort (first treated period, or ``NEVER``) to its number of units.

    y = unit effect + period effect + ``effect(cohort, rel)`` from adoption on
    + ``pre_slope * rel`` before adoption (an injected pre-trend) + noise; ``missing`` drops
    that share of rows at random (an unbalanced panel).
    """
    rng = np.random.default_rng(seed)
    period_fe = rng.normal(0.0, 1.0, periods)
    units, times, ys, cohorts = [], [], [], []
    for cohort, size in sizes.items():
        for k in range(size):
            label = f"c{cohort}-{k}"
            unit_fe = rng.normal(0.0, 1.0)
            for t in range(periods):
                y = unit_fe + period_fe[t] + rng.normal(0.0, noise)
                if cohort != NEVER:
                    rel = t - cohort
                    y += effect(cohort, rel) if rel >= 0 else pre_slope * rel
                units.append(label)
                times.append(t)
                ys.append(y)
                cohorts.append(cohort)
    keep = rng.random(len(ys)) >= missing
    pick = np.flatnonzero(keep)
    return DidPanel.from_arrays(
        unit=[units[i] for i in pick],
        time=np.asarray(times)[pick],
        y=np.asarray(ys)[pick],
        cohort=np.asarray(cohorts)[pick],
    )


def cell_mean(panel: DidPanel, cohort: int | None, time: int) -> float:
    """Mean of ``y`` over the rows of one cohort (``None``: the controls) in one period."""
    if cohort is None:
        rows = (panel.cohort == NEVER) & (panel.time == time)
    else:
        rows = (panel.cohort == cohort) & (panel.time == time)
    return float(panel.y[rows].mean())


def dummy_ols(
    x: np.ndarray, y: np.ndarray, unit: np.ndarray, time: np.ndarray, w: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Weighted OLS of y on x plus explicit unit and period dummies; slopes and residuals."""
    _, u = np.unique(unit, return_inverse=True)
    _, t = np.unique(time, return_inverse=True)
    du = np.eye(u.max() + 1)[u]
    dt = np.eye(t.max() + 1)[t][:, 1:]
    z = np.column_stack([x, du, dt])
    s = np.sqrt(w)
    beta, *_ = np.linalg.lstsq(z * s[:, None], y * s, rcond=None)
    return beta[: x.shape[1]], y - z @ beta
