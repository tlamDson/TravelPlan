"""Benjamini-Hochberg FDR control (B2 plan, PR 12); must pass the G-ref ``bh`` cases."""

import numpy as np
import pytest
from conftest import GOLDEN_LATEST

from abkit.golden.methods import IMPLEMENTATIONS
from abkit.golden.runner import Status, run_golden
from abkit.stats import bh_fdr


def test_adjusts_by_rank_with_a_step_up_minimum_in_input_order() -> None:
    # Sorted 0.005, 0.01, 0.03, 0.04 -> x4/rank 0.02, 0.02, 0.04, 0.04 (already monotone).
    res = bh_fdr([0.01, 0.04, 0.03, 0.005], alpha=0.03)
    assert res.p_adjusted == pytest.approx((0.02, 0.04, 0.04, 0.02), rel=1e-12)
    assert res.rejected == (True, False, False, True)
    assert res.alpha == 0.03
    assert res.n_rejected == 2


def test_step_up_lets_a_larger_p_rescue_smaller_ones() -> None:
    # Raw x3/rank: 0.06, 0.045, 0.04 -> the running minimum from the top makes all 0.04.
    res = bh_fdr([0.02, 0.03, 0.04], alpha=0.05)
    assert res.p_adjusted == pytest.approx((0.04, 0.04, 0.04), rel=1e-12)
    assert res.rejected == (True, True, True)


def test_never_exceeds_one_and_keeps_a_single_p_unchanged() -> None:
    assert bh_fdr([0.9, 0.95]).p_adjusted == pytest.approx((0.95, 0.95))
    # Raw x3/rank: 1.8, 1.485, 1.0; the largest p bounds every adjusted value.
    assert bh_fdr([0.6, 1.0, 0.99]).p_adjusted == pytest.approx((1.0, 1.0, 1.0))
    assert bh_fdr([0.2]).p_adjusted == pytest.approx((0.2,))


def test_rejects_when_the_adjusted_p_equals_alpha() -> None:
    """BH's step-up rule is p_(k) <= k/m * alpha, so equality rejects (as statsmodels does)."""
    assert bh_fdr([0.05], alpha=0.05).rejected == (True,)
    assert bh_fdr([0.0500001], alpha=0.05).rejected == (False,)


@pytest.mark.parametrize(
    ("p_values", "alpha", "match"),
    [
        ([], 0.05, "at least 1"),
        ([[0.1, 0.2]], 0.05, "1-D"),
        ([0.1, -0.01], 0.05, r"\[0, 1\]"),
        ([0.1, 1.2], 0.05, r"\[0, 1\]"),
        ([0.1, np.nan], 0.05, "finite"),
        ([0.1], 0.0, "alpha"),
        ([0.1], 1.0, "alpha"),
    ],
)
def test_rejects_bad_input(p_values, alpha, match) -> None:
    with pytest.raises(ValueError, match=match):
        bh_fdr(p_values, alpha=alpha)


def test_bh_is_registered_and_every_g_ref_bh_case_passes() -> None:
    assert "bh_fdr" in IMPLEMENTATIONS
    report = run_golden(GOLDEN_LATEST)
    bh = [r for r in report.results if r.case_id.startswith("bh/")]
    assert len(bh) == 3
    assert [(r.case_id, r.status, r.details) for r in bh if r.status is not Status.PASS] == []
