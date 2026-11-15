"""CATE by group: Welch per group plus Cochran's Q test of equal effects across groups.

Expected numbers come from scipy (``ttest_ind(equal_var=False)``) and the Q formula written
out by hand, never from abkit itself.
"""

import math

import numpy as np
import pytest
from scipy import stats

from abkit.stats import CateResult, cate_by_group

# Two groups, a and b; b has a much larger effect than a.
VALUES = [1.0, 2.0, 3.0, 2.0, 2.5, 3.5, 5.0, 6.0, 5.5, 9.0, 10.0, 11.5]
TREATED = [0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0]
GROUPS = ["a", "a", "a", "a", "a", "a", "b", "b", "b", "b", "b", "b"]


def _arms(group: str) -> tuple[np.ndarray, np.ndarray]:
    v, t, g = np.array(VALUES), np.array(TREATED, dtype=bool), np.array(GROUPS)
    return v[(g == group) & ~t], v[(g == group) & t]


def _scipy_effect(group: str) -> tuple[float, float, float]:
    control, treatment = _arms(group)
    estimate = treatment.mean() - control.mean()
    se = math.sqrt(treatment.var(ddof=1) / treatment.size + control.var(ddof=1) / control.size)
    p = stats.ttest_ind(treatment, control, equal_var=False).pvalue
    return estimate, se, p


def test_each_group_is_a_welch_test_on_its_own_users() -> None:
    result = cate_by_group(VALUES, TREATED, GROUPS)
    assert isinstance(result, CateResult)
    assert [g.group for g in result.groups] == ["a", "b"]
    for label in ("a", "b"):
        estimate, se, p = _scipy_effect(label)
        effect = result.effect(label)
        assert effect.estimate == pytest.approx(estimate, abs=1e-12)
        assert effect.se == pytest.approx(se, rel=1e-12)
        assert effect.p_value == pytest.approx(p, rel=1e-9)
        assert effect.ci_low < effect.estimate < effect.ci_high
    assert (result.effect("a").n_control, result.effect("a").n_treatment) == (3, 3)


def test_cochran_q_tests_whether_the_group_effects_differ() -> None:
    result = cate_by_group(VALUES, TREATED, GROUPS)
    (ea, sa, _), (eb, sb, _) = _scipy_effect("a"), _scipy_effect("b")
    wa, wb = 1 / sa**2, 1 / sb**2
    pooled = (wa * ea + wb * eb) / (wa + wb)
    q = wa * (ea - pooled) ** 2 + wb * (eb - pooled) ** 2
    assert result.pooled_estimate == pytest.approx(pooled, rel=1e-12)
    assert result.pooled_se == pytest.approx(math.sqrt(1 / (wa + wb)), rel=1e-12)
    assert result.q_statistic == pytest.approx(q, rel=1e-12)
    assert result.q_df == 1
    assert result.q_p_value == pytest.approx(stats.chi2.sf(q, 1), rel=1e-9)
    assert result.heterogeneity == ("reject_null" if result.q_p_value < 0.05 else "fail_to_reject")


def test_equal_group_effects_give_q_zero() -> None:
    # Group b is group a shifted by a constant: same effect, same variance.
    values = [1.0, 2.0, 4.0, 6.0, 11.0, 12.0, 14.0, 16.0]
    treated = [0, 0, 1, 1, 0, 0, 1, 1]
    groups = ["x"] * 4 + ["y"] * 4
    result = cate_by_group(values, treated, groups)
    assert result.q_statistic == pytest.approx(0.0, abs=1e-12)
    assert result.q_p_value == pytest.approx(1.0)
    assert result.pooled_estimate == pytest.approx(3.5)


def test_groups_are_sorted_and_labels_become_strings() -> None:
    values = [0, 1, 0, 1, 2, 3, 2, 4, 5, 6, 5, 8]
    treated = [0, 0, 1, 1] * 3
    groups = [2, 2, 2, 2, 0, 0, 0, 0, 1, 1, 1, 1]
    result = cate_by_group(values, treated, groups)
    assert [g.group for g in result.groups] == ["0", "1", "2"]
    assert result.q_df == 2


def test_alpha_sets_the_interval_level() -> None:
    narrow = cate_by_group(VALUES, TREATED, GROUPS, alpha=0.2).effect("a")
    wide = cate_by_group(VALUES, TREATED, GROUPS, alpha=0.01).effect("a")
    assert wide.ci_high - wide.ci_low > narrow.ci_high - narrow.ci_low


@pytest.mark.parametrize(
    ("values", "treated", "groups", "message"),
    [
        ([1.0, 2.0, 3.0], [0, 1], ["a", "a", "a"], "same length"),
        ([1.0, 2.0, 3.0, 4.0], [0, 0, 1, 1], ["a", "a", "a", "a"], "at least 2 groups"),
        ([1.0, 2.0, 3.0, 4.0], [0, 2, 1, 1], ["a", "a", "b", "b"], "0/1"),
        ([1.0, 2.0, 3.0, 4.0, 5.0, 6.0], [0, 0, 1, 0, 0, 1], ["a"] * 3 + ["b"] * 3, "group a"),
        ([1.0, math.nan, 3.0, 4.0], [0, 0, 1, 1], ["a", "a", "b", "b"], "finite"),
    ],
)
def test_bad_input_raises(values, treated, groups, message) -> None:
    with pytest.raises(ValueError, match=message):
        cate_by_group(values, treated, groups)
