import math

import pytest
from scipy import stats

from abkit.stats import (
    cohens_h,
    mde_ttest_ind,
    power_proportions,
    power_ttest_ind,
    sample_size_proportions,
    sample_size_ttest_ind,
)


def test_power_with_no_effect_equals_alpha() -> None:
    assert power_ttest_ind(0.0, 100, alpha=0.05) == pytest.approx(0.05, rel=1e-9)
    assert power_ttest_ind(0.0, 100, alpha=0.05, alternative="greater") == pytest.approx(0.05)


def test_power_matches_the_noncentral_t_by_hand() -> None:
    # 400 per group: df = 798, noncentrality = d * sqrt(400 * 400 / 800).
    df, nc = 798, 0.2 * math.sqrt(200)
    crit = stats.t.isf(0.025, df)
    expected = stats.nct.sf(crit, df, nc) + stats.nct.cdf(-crit, df, nc)
    assert power_ttest_ind(0.2, 400, alpha=0.05) == pytest.approx(expected, rel=1e-12)


def test_power_grows_with_sample_size_and_effect() -> None:
    assert power_ttest_ind(0.2, 100) < power_ttest_ind(0.2, 200) < power_ttest_ind(0.2, 400)
    assert power_ttest_ind(0.1, 400) < power_ttest_ind(0.3, 400)
    assert power_ttest_ind(0.2, 400, alternative="greater") > power_ttest_ind(0.2, 400)
    assert power_ttest_ind(-0.2, 400, alternative="less") == pytest.approx(
        power_ttest_ind(0.2, 400, alternative="greater")
    )


def test_sample_size_inverts_power() -> None:
    for d, ratio, alt in [(0.1, 1.0, "two-sided"), (0.1, 2.0, "two-sided"), (0.3, 0.5, "greater")]:
        n = sample_size_ttest_ind(d, power=0.8, ratio=ratio, alternative=alt)
        assert power_ttest_ind(d, n, ratio=ratio, alternative=alt) == pytest.approx(0.8, abs=1e-9)


def test_sample_size_is_close_to_the_normal_approximation() -> None:
    z = stats.norm.ppf(0.975) + stats.norm.ppf(0.8)
    normal = 2 * (z / 0.1) ** 2
    n = sample_size_ttest_ind(0.1, power=0.8)
    assert normal < n < normal + 2


def test_mde_inverts_power_and_takes_the_sign_of_the_alternative() -> None:
    d = mde_ttest_ind(5000, power=0.8)
    assert d > 0
    assert power_ttest_ind(d, 5000) == pytest.approx(0.8, abs=1e-9)
    less = mde_ttest_ind(5000, power=0.8, alternative="less")
    assert less < 0
    assert less == pytest.approx(-mde_ttest_ind(5000, power=0.8, alternative="greater"))
    assert mde_ttest_ind(20_000, power=0.8) < d


def test_statsmodels_alternative_names_are_accepted() -> None:
    assert power_ttest_ind(0.2, 400, alternative="larger") == power_ttest_ind(
        0.2, 400, alternative="greater"
    )
    assert mde_ttest_ind(400, power=0.8, alternative="smaller") < 0


def test_cohens_h_is_the_arcsine_difference() -> None:
    h = 2 * math.asin(math.sqrt(0.103)) - 2 * math.asin(math.sqrt(0.1))
    assert cohens_h(0.103, 0.1) == pytest.approx(h, rel=1e-12)
    assert cohens_h(0.1, 0.103) == pytest.approx(-h, rel=1e-12)


def test_one_sided_proportions_sample_size_matches_the_closed_form() -> None:
    # One tail only, so n_eff = ((z_{1-a} + z_power) / h)^2 exactly and nobs1 = n_eff (1 + r) / r.
    h = cohens_h(0.12, 0.1)
    n_eff = ((stats.norm.ppf(0.95) + stats.norm.ppf(0.8)) / h) ** 2
    res = sample_size_proportions(0.1, 0.12, power=0.8, ratio=3.0, alternative="greater")
    assert res.effect_size == pytest.approx(h, rel=1e-12)
    assert res.nobs1 == pytest.approx(n_eff * 4 / 3, rel=1e-9)


def test_proportions_sample_size_inverts_power() -> None:
    res = sample_size_proportions(0.1, 0.103, power=0.8)
    assert res.nobs1 > 100_000
    assert power_proportions(0.1, 0.103, res.nobs1) == pytest.approx(0.8, abs=1e-9)


@pytest.mark.parametrize(
    ("call", "match"),
    [
        (lambda: sample_size_ttest_ind(0.2, power=0.8, alternative="less"), "cannot reach"),
        (lambda: sample_size_ttest_ind(0.0, power=0.8), "effect_size"),
        (lambda: sample_size_ttest_ind(0.2, power=0.01), "power"),
        (lambda: sample_size_ttest_ind(0.2, power=1.0), "power"),
        (lambda: power_ttest_ind(0.2, 0.5), "nobs1"),
        (lambda: power_ttest_ind(0.2, 100, ratio=0.0), "ratio"),
        (lambda: power_ttest_ind(math.nan, 100), "effect_size"),
        (lambda: power_ttest_ind(0.2, 100, alternative="up"), "alternative"),
        (lambda: mde_ttest_ind(100, power=0.8, alpha=1.5), "alpha"),
        (lambda: cohens_h(1.2, 0.1), "proportion"),
        (lambda: sample_size_proportions(0.1, 0.1, power=0.8), "differ"),
    ],
)
def test_rejects_bad_input(call, match) -> None:
    with pytest.raises(ValueError, match=match):
        call()
