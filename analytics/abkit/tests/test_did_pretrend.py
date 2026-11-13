"""The joint Wald pre-trend test of the event study (B2 plan, PR 19)."""

import numpy as np
import pytest
from did_fixtures import staggered_panel
from scipy import stats

from abkit.did.panel import NEVER
from abkit.did.sunab import sun_abraham

SIZES = {5: 15, 8: 15, NEVER: 30}


def test_the_wald_statistic_uses_the_pre_period_coefficients_and_their_covariance() -> None:
    panel = staggered_panel(SIZES, periods=13, seed=10)
    study = sun_abraham(panel, pre=4, post=3)
    pre = [e for e in study.event_times if e.rel < 0]
    assert [e.rel for e in pre] == [-4, -3, -2]
    est = np.array([e.estimate for e in pre])
    cov = study.event_vcov[: len(pre), : len(pre)]
    assert np.sqrt(np.diag(cov)) == pytest.approx([e.se for e in pre], rel=1e-12)
    stat = float(est @ np.linalg.solve(cov, est))
    assert study.pretrend_stat == pytest.approx(stat, rel=1e-9)
    assert study.pretrend_df == 3
    assert study.pretrend_p == pytest.approx(float(stats.chi2.sf(stat, 3)), rel=1e-9)


def test_an_injected_pre_trend_is_detected() -> None:
    panel = staggered_panel(SIZES, periods=13, pre_slope=0.5, seed=11)
    assert sun_abraham(panel, pre=4, post=3).pretrend_p < 1e-4


def test_the_pre_trend_test_holds_its_size_under_parallel_trends() -> None:
    rejections = 0
    reps = 120
    for seed in range(reps):
        panel = staggered_panel(SIZES, periods=13, missing=0.2, seed=100 + seed)
        rejections += sun_abraham(panel, pre=4, post=3).pretrend_p < 0.05
    # 120 null panels: a 5% test rejects about 6 times; 18 would be a 15% test
    assert rejections <= 18


def test_the_att_interval_covers_the_injected_effect_on_unbalanced_panels() -> None:
    covered = 0
    reps = 120
    for seed in range(reps):
        panel = staggered_panel(
            SIZES, periods=13, effect=lambda c, r: 0.5, missing=0.2, seed=500 + seed
        )
        study = sun_abraham(panel, pre=4, post=3)
        covered += study.att.ci_low <= 0.5 <= study.att.ci_high
    assert covered >= 102  # nominal 95% is 114 of 120
