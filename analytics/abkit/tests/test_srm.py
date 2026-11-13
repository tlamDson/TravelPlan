import pytest
from scipy import stats

from abkit.stats import SRM_THRESHOLD, srm_chisquare


def test_flags_a_broken_fifty_fifty_split() -> None:
    # Expected 5,000 each: statistic = 2 * 200^2 / 5000 = 16 on 1 dof.
    res = srm_chisquare([5200, 4800], [0.5, 0.5])
    assert res.statistic == pytest.approx(16.0, rel=1e-12)
    assert res.dof == 1
    assert res.p_value == pytest.approx(stats.chi2.sf(16.0, 1), rel=1e-12)
    assert res.threshold == SRM_THRESHOLD == 0.0005
    assert res.srm is True
    assert res.decision == "srm"


def test_passes_a_three_way_split_with_holdout_and_normalises_shares() -> None:
    # Shares 10/45/45 given as weights; expected counts 1000 / 4500 / 4500.
    res = srm_chisquare([1003, 4511, 4486], [2, 9, 9])
    statistic = 3**2 / 1000 + 11**2 / 4500 + 14**2 / 4500
    assert res.statistic == pytest.approx(statistic, rel=1e-12)
    assert res.dof == 2
    assert res.p_value == pytest.approx(stats.chi2.sf(statistic, 2), rel=1e-12)
    assert res.srm is False
    assert res.decision == "no_srm"


def test_threshold_is_strict_and_configurable() -> None:
    p_value = srm_chisquare([5200, 4800], [0.5, 0.5]).p_value
    assert srm_chisquare([5200, 4800], [0.5, 0.5], threshold=p_value).srm is False
    assert srm_chisquare([5100, 4900], [0.5, 0.5], threshold=0.1).srm is True


@pytest.mark.parametrize(
    ("observed", "shares", "kwargs", "match"),
    [
        ([10], [1.0], {}, "at least 2"),
        ([10, 10], [0.5, 0.3, 0.2], {}, "same length"),
        ([10, -1], [0.5, 0.5], {}, "non-negative"),
        ([10, 1.5], [0.5, 0.5], {}, "whole"),
        ([10, 10], [0.5, 0.0], {}, "positive"),
        ([0, 0], [0.5, 0.5], {}, "no units"),
        ([10, 10], [0.5, 0.5], {"threshold": 0}, "threshold"),
    ],
)
def test_rejects_bad_input(observed, shares, kwargs, match) -> None:
    with pytest.raises(ValueError, match=match):
        srm_chisquare(observed, shares, **kwargs)
