"""Sun & Abraham interaction-weighted event study (B2 plan, PR 19)."""

import numpy as np
import pytest
from did_fixtures import cell_mean, dummy_ols, staggered_panel

from abkit.did.panel import NEVER, DidPanel
from abkit.did.sunab import sun_abraham, twfe_event_study, twfe_static


def _growing(cohort: int, rel: int) -> float:
    """Early adopters gain more, and every cohort's effect grows with time since adoption."""
    return (0.4 if cohort == 4 else 0.1) * (rel + 1)


def test_balanced_cohort_effects_are_the_two_by_two_did_against_never_treated() -> None:
    panel = staggered_panel({4: 6, 7: 5, NEVER: 8}, periods=12, effect=_growing, seed=1)
    study = sun_abraham(panel, pre=3, post=4)
    assert study.cohorts == (4, 7)
    for (cohort, rel), value in study.cohort_effects.items():
        t, ref = cohort + rel, cohort - 1
        expected = (cell_mean(panel, cohort, t) - cell_mean(panel, cohort, ref)) - (
            cell_mean(panel, None, t) - cell_mean(panel, None, ref)
        )
        assert value == pytest.approx(expected, abs=1e-9), (cohort, rel)
    assert sorted(study.cohort_effects) == [(c, r) for c in (4, 7) for r in range(-3, 5) if r != -1]


def test_noise_free_heterogeneous_effects_are_recovered_exactly() -> None:
    panel = staggered_panel({4: 10, 9: 30, NEVER: 20}, periods=14, effect=_growing, noise=0.0)
    study = sun_abraham(panel, pre=3, post=4)
    for e in study.event_times:
        if e.rel < 0:
            assert e.estimate == pytest.approx(0.0, abs=1e-9)
        else:
            # weights are each cohort's share of the treated rows at that event time
            truth = (10 * _growing(4, e.rel) + 30 * _growing(9, e.rel)) / 40
            assert e.estimate == pytest.approx(truth, abs=1e-9)
    truth_att = np.mean([(10 * _growing(4, r) + 30 * _growing(9, r)) / 40 for r in range(5)])
    assert study.att.estimate == pytest.approx(truth_att, abs=1e-9)
    assert [e.rel for e in study.event_times] == [-3, -2, 0, 1, 2, 3, 4]
    assert study.event(0).n_obs == 40


def test_pooled_twfe_event_study_is_contaminated_by_cohort_heterogeneity() -> None:
    panel = staggered_panel({4: 10, 9: 30, NEVER: 20}, periods=14, effect=_growing, noise=0.0)
    sa = sun_abraham(panel, pre=3, post=4)
    pooled = twfe_event_study(panel, pre=3, post=4)
    # the pooled coefficients are what OLS on pooled relative-time dummies gives
    keep = panel.is_control | ((panel.time - panel.cohort >= -3) & (panel.time - panel.cohort <= 4))
    rels = [-3, -2, 0, 1, 2, 3, 4]
    rel = np.where(panel.is_control, 99, panel.time - panel.cohort)[keep]
    x = np.column_stack([(rel == r).astype(float) for r in rels])
    expected, _ = dummy_ols(
        x, panel.y[keep], panel.unit[keep], panel.time[keep], np.ones(x.shape[0])
    )
    np.testing.assert_allclose([e.estimate for e in pooled.event_times], expected, atol=1e-9)
    gap = max(
        abs(p.estimate - s.estimate)
        for p, s in zip(pooled.event_times, sa.event_times, strict=True)
    )
    assert gap > 0.05
    assert pooled.method == "twfe_event_study" and sa.method == "sun_abraham"


def test_static_twfe_is_the_ols_coefficient_on_the_treated_indicator() -> None:
    panel = staggered_panel({4: 10, 9: 30, NEVER: 20}, periods=14, effect=_growing, seed=2)
    result = twfe_static(panel)
    d = ((~panel.is_control) & (panel.time >= panel.cohort)).astype(float)[:, None]
    expected, _ = dummy_ols(d, panel.y, panel.unit, panel.time, np.ones(d.shape[0]))
    assert result.estimate == pytest.approx(float(expected[0]), abs=1e-9)
    assert result.method == "twfe_static" and result.estimand == "att"
    assert (result.n_treated, result.n_control) == (40, 20)
    assert result.ci_low < result.estimate < result.ci_high


def test_late_adopters_serve_as_controls_and_can_be_excluded() -> None:
    panel = staggered_panel({3: 8, 30: 6, NEVER: 6}, periods=10, effect=_growing, seed=4)
    both = sun_abraham(panel, pre=2, post=3)
    assert (both.n_treated_units, both.n_control_units) == (8, 12)
    never = sun_abraham(panel, pre=2, post=3, controls="never")
    assert (never.n_treated_units, never.n_control_units) == (8, 6)
    assert never.att.estimate != pytest.approx(both.att.estimate, abs=1e-12)
    with pytest.raises(ValueError, match="controls"):
        sun_abraham(panel, pre=2, post=3, controls="everyone")


def test_a_cohort_without_a_reference_period_row_is_dropped() -> None:
    base = staggered_panel({4: 5, 7: 3, NEVER: 6}, periods=10, effect=_growing, seed=5)
    gone = (base.cohort == 7) & (base.time == 6)
    study = sun_abraham(base.subset(~gone), pre=2, post=2)
    assert study.cohorts == (4,)
    assert study.dropped_cohorts == (7,)
    assert study.n_treated_units == 5


def test_inference_fields_are_consistent() -> None:
    panel = staggered_panel({4: 60, 8: 60, NEVER: 90}, periods=12, effect=_growing, seed=6)
    study = sun_abraham(panel, pre=3, post=3, alpha=0.1)
    assert study.alpha == 0.1 and study.att.alpha == 0.1
    for e in study.event_times:
        assert e.se > 0 and e.ci_low < e.estimate < e.ci_high
        assert e.ci_high - e.ci_low == pytest.approx(2 * 1.6448536269514722 * e.se, rel=1e-9)
        assert 0 <= e.p_value <= 1
    # true ATT 0.625 (mean of 0.25 * (rel + 1) over rel 0..3); noise sd 1 per row
    assert study.att.p_value < 1e-3
    assert study.n_clusters == 210


def test_errors_on_no_controls_or_bad_windows() -> None:
    treated_only = staggered_panel({4: 5, 7: 5}, periods=10, effect=_growing, seed=7)
    with pytest.raises(ValueError, match="control"):
        sun_abraham(treated_only, pre=2, post=2)
    panel = staggered_panel({4: 5, NEVER: 5}, periods=10, effect=_growing, seed=7)
    with pytest.raises(ValueError, match="pre"):
        sun_abraham(panel, pre=1, post=2)
    with pytest.raises(ValueError, match="post"):
        sun_abraham(panel, pre=2, post=-1)
    with pytest.raises(KeyError):
        sun_abraham(panel, pre=2, post=2).event(-1)


def test_never_treated_panel_has_no_treated_cohort() -> None:
    panel = staggered_panel({NEVER: 5}, periods=6, seed=8)
    with pytest.raises(ValueError, match="treated"):
        sun_abraham(panel, pre=2, post=2)
    assert isinstance(panel, DidPanel)
