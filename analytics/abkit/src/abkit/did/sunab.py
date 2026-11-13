"""Staggered event study: Sun & Abraham (2021), with pooled and static TWFE to compare.

Sun & Abraham's interaction-weighted estimator regresses the outcome on unit and period
effects plus one dummy per (cohort, event time) cell of the treated units, inside the window
``[-pre, post]`` (treated rows outside it are dropped), with event time -1 as the reference.
Controls are the never-treated units and, unless ``controls="never"``, the units adopting
after the panel ends. Each event time's effect is the average of its cohort cells weighted by
each cohort's share of the treated rows at that event time; the weights are taken as fixed in
the variance. A cohort with no row at event time -1 is not identified and is dropped.

``att`` is the mean of the post event times 0..post. The pre-trend test is the joint Wald
chi-square of the pre event times ``-pre..-2`` (all zero under parallel trends and no
anticipation), with the rank of their covariance as degrees of freedom
(``abkit.did.results.wald_test``). Errors are clustered by unit (CR1, ``abkit.did.fe``);
intervals and p-values are normal-based.

The pooled TWFE event study uses one dummy per event time on the same sample; under
heterogeneous cohort effects its coefficients mix in other event times (Sun & Abraham 2021).
"""

from __future__ import annotations

import numpy as np

from abkit.causal.estimators import CausalResult
from abkit.did.fe import fe_ols
from abkit.did.panel import CONTROLS, NEVER, DidPanel
from abkit.did.results import EventStudy, EventTime, normal_inference, wald_test
from abkit.stats._common import check_alpha

REF = -1


def _check(pre: int, post: int) -> None:
    if pre < 2:
        raise ValueError(f"pre must be >= 2 (event time -1 is the reference), got {pre}")
    if post < 0:
        raise ValueError(f"post must be >= 0, got {post}")


def _control_mask(panel: DidPanel, controls: str) -> tuple[np.ndarray, np.ndarray]:
    """(control rows, rows to use at all): late adopters drop out under ``never``."""
    if controls not in CONTROLS:
        raise ValueError(f"controls must be one of {CONTROLS}, got {controls!r}")
    usable = ~panel.is_late if controls == "never" else np.ones(panel.n_obs, dtype=bool)
    return panel.is_control & usable, usable


def _window(panel: DidPanel, pre: int, post: int, controls: str):
    control, usable = _control_mask(panel, controls)
    treated = usable & ~control
    rel = panel.time - panel.cohort
    window = treated & (rel >= -pre) & (rel <= post)
    if not window.any():
        raise ValueError("the panel has no treated cohort inside the event window")
    if not control.any():
        raise ValueError("the event study needs never-treated or late-adopting control units")
    all_cohorts = np.unique(panel.cohort[window])
    with_ref = np.unique(panel.cohort[window & (rel == REF)])
    dropped = tuple(int(c) for c in np.setdiff1d(all_cohorts, with_ref))
    keep = control | (window & ~np.isin(panel.cohort, dropped))
    return keep, np.where(control, NEVER, panel.cohort), rel, dropped


def _study(panel: DidPanel, pre: int, post: int, alpha: float, controls: str, pooled: bool):
    _check(pre, post)
    alpha = check_alpha(alpha)
    keep, cohort, rel, dropped = _window(panel, pre, post, controls)
    cohort, rel = cohort[keep], rel[keep]
    treated = cohort != NEVER
    cells = sorted(
        {(int(c), int(r)) for c, r in zip(cohort[treated], rel[treated], strict=True) if r != REF}
    )
    keys = sorted({r for _, r in cells}) if pooled else cells
    index = {key: j for j, key in enumerate(keys)}
    x = np.zeros((cohort.size, len(keys)))
    for i in np.flatnonzero(treated & (rel != REF)):
        x[i, index[int(rel[i]) if pooled else (int(cohort[i]), int(rel[i]))]] = 1.0
    unit = panel.unit[keep]
    fit = fe_ols(x, panel.y[keep], unit, panel.time[keep], weight=panel.weight[keep])
    counts = x.sum(axis=0) * fit.kept  # a collinear cell gets no weight
    rel_of = [key if pooled else key[1] for key in keys]
    event_rels = sorted({r for r, c in zip(rel_of, counts, strict=True) if c > 0})
    agg = np.zeros((len(event_rels), len(keys)))
    n_rows = []
    for k, r in enumerate(event_rels):
        cols = [j for j, rj in enumerate(rel_of) if rj == r]
        agg[k, cols] = counts[cols] / counts[cols].sum()
        n_rows.append(int(counts[cols].sum()))
    nu = agg @ np.nan_to_num(fit.coef)
    sigma = agg @ np.nan_to_num(fit.vcov) @ agg.T
    se = np.sqrt(np.clip(np.diag(sigma), 0.0, None))
    events = []
    for k, r in enumerate(event_rels):
        low, high, p = normal_inference(float(nu[k]), float(se[k]), alpha)
        events.append(EventTime(r, float(nu[k]), float(se[k]), low, high, p, n_rows[k]))
    post_k = [k for k, r in enumerate(event_rels) if r >= 0]
    pre_k = [k for k, r in enumerate(event_rels) if r < 0]
    if not post_k:
        raise ValueError("no identified post-adoption event time inside the window")
    a = np.zeros(len(event_rels))
    a[post_k] = 1.0 / len(post_k)
    att, att_se = float(a @ nu), float(np.sqrt(max(a @ sigma @ a, 0.0)))
    low, high, p = normal_inference(att, att_se, alpha)
    stat, df, pretrend_p = wald_test(nu[pre_k], sigma[np.ix_(pre_k, pre_k)])
    units_treated = np.unique(unit[treated]).size
    units_control = np.unique(unit[~treated]).size
    return EventStudy(
        method="twfe_event_study" if pooled else "sun_abraham",
        pre=pre,
        post=post,
        alpha=alpha,
        event_times=tuple(events),
        event_vcov=sigma,
        att=CausalResult(
            method="twfe_event_study" if pooled else "sun_abraham",
            estimand="att",
            estimate=att,
            se=att_se,
            statistic=att / att_se if att_se > 0 else float("nan"),
            p_value=p,
            ci_low=low,
            ci_high=high,
            alpha=alpha,
            n_treated=units_treated,
            n_control=units_control,
        ),
        pretrend_stat=stat,
        pretrend_df=df,
        pretrend_p=pretrend_p,
        cohort_effects={} if pooled else {key: float(fit.coef[j]) for key, j in index.items()},
        cohorts=tuple(int(c) for c in np.unique(cohort[treated])),
        dropped_cohorts=dropped,
        n_obs=int(keep.sum()),
        n_treated_units=units_treated,
        n_control_units=units_control,
        n_clusters=fit.n_clusters,
    )


def sun_abraham(
    panel: DidPanel, pre: int, post: int, alpha: float = 0.05, controls: str = "never_and_late"
) -> EventStudy:
    """Sun & Abraham's interaction-weighted event study on the window ``[-pre, post]``."""
    return _study(panel, pre, post, alpha, controls, pooled=False)


def twfe_event_study(
    panel: DidPanel, pre: int, post: int, alpha: float = 0.05, controls: str = "never_and_late"
) -> EventStudy:
    """The pooled TWFE event study (one dummy per event time) on the same sample."""
    return _study(panel, pre, post, alpha, controls, pooled=True)


def twfe_static(
    panel: DidPanel, alpha: float = 0.05, controls: str = "never_and_late"
) -> CausalResult:
    """Static TWFE: one treated-from-adoption dummy on every row of the panel."""
    alpha = check_alpha(alpha)
    control, usable = _control_mask(panel, controls)
    if not (usable & ~control).any() or not control.any():
        raise ValueError("static TWFE needs both treated and control units")
    d = (~control & (panel.time >= panel.cohort)).astype(float)[usable]
    unit = panel.unit[usable]
    fit = fe_ols(d, panel.y[usable], unit, panel.time[usable], weight=panel.weight[usable])
    if not fit.kept[0]:
        raise ValueError("the treated dummy is absorbed by the fixed effects")
    estimate, se = float(fit.coef[0]), float(np.sqrt(fit.vcov[0, 0]))
    low, high, p = normal_inference(estimate, se, alpha)
    return CausalResult(
        method="twfe_static",
        estimand="att",
        estimate=estimate,
        se=se,
        statistic=estimate / se,
        p_value=p,
        ci_low=low,
        ci_high=high,
        alpha=alpha,
        n_treated=int(np.unique(unit[~control[usable]]).size),
        n_control=int(np.unique(unit[control[usable]]).size),
    )
