"""mSPRT with a normal mixture (Johari et al., always-valid inference; B2 plan, PR 12).

The closed forms are checked against a direct numerical integral of the mixture
likelihood ratio, so the engine does not confirm its own formula.
"""

import math

import numpy as np
import pytest
from scipy import integrate, stats

from abkit.stats import (
    MsprtResult,
    msprt_halfwidth,
    msprt_likelihood_ratio,
    msprt_sequence,
    msprt_test,
    welch_ttest,
)


def _integrated_lr(estimate: float, variance: float, tau: float) -> float:
    """∫ N(estimate; θ, V) / N(estimate; 0, V) · N(θ; 0, τ²) dθ."""
    sd = math.sqrt(variance)

    def integrand(theta: float) -> float:
        ratio = stats.norm.pdf(estimate, theta, sd) / stats.norm.pdf(estimate, 0, sd)
        return ratio * stats.norm.pdf(theta, 0, tau)

    value, _ = integrate.quad(integrand, -12 * tau, 12 * tau, epsabs=0, epsrel=1e-11, limit=200)
    return value


@pytest.mark.parametrize(
    ("estimate", "variance", "tau"),
    [(0.0, 1.0, 0.5), (0.3, 0.04, 0.2), (-0.012, 6.4e-5, 0.01), (2.5, 1.0, 3.0)],
)
def test_likelihood_ratio_matches_the_mixture_integral(estimate, variance, tau) -> None:
    lr = msprt_likelihood_ratio(estimate, variance, tau)
    assert float(lr) == pytest.approx(_integrated_lr(estimate, variance, tau), rel=1e-8)


def test_likelihood_ratio_is_vectorised_and_symmetric_in_the_estimate() -> None:
    est = np.array([[-0.2, 0.0, 0.2], [0.5, -0.5, 1.0]])
    lr = msprt_likelihood_ratio(est, 0.04, 0.3)
    assert lr.shape == (2, 3)
    assert lr[0, 0] == pytest.approx(lr[0, 2], rel=1e-14)
    assert lr[1, 0] == pytest.approx(lr[1, 1], rel=1e-14)
    # With no signal the mixture ratio is sqrt(V / (V + τ²)) < 1.
    assert lr[0, 1] == pytest.approx(math.sqrt(0.04 / (0.04 + 0.09)), rel=1e-14)


@pytest.mark.parametrize(("variance", "tau", "alpha"), [(0.04, 0.2, 0.05), (6.4e-5, 0.01, 0.1)])
def test_halfwidth_is_where_the_ratio_reaches_one_over_alpha(variance, tau, alpha) -> None:
    half = float(msprt_halfwidth(variance, tau, alpha))
    assert float(msprt_likelihood_ratio(half, variance, tau)) == pytest.approx(1 / alpha, rel=1e-10)
    assert float(msprt_likelihood_ratio(-half, variance, tau)) == pytest.approx(
        1 / alpha, rel=1e-10
    )


def test_snapshot_test_on_raw_samples() -> None:
    rng = np.random.default_rng(7)
    control = rng.normal(10.0, 2.0, 400)
    treatment = rng.normal(10.6, 2.0, 400)
    res = msprt_test(control, treatment, tau=0.5, alpha=0.05)
    welch = welch_ttest(control, treatment)
    assert isinstance(res, MsprtResult)
    assert res.estimate == pytest.approx(welch.estimate, rel=1e-12)
    assert res.se == pytest.approx(welch.se, rel=1e-12)
    lr = float(msprt_likelihood_ratio(res.estimate, res.se**2, 0.5))
    assert res.likelihood_ratio == pytest.approx(lr, rel=1e-12)
    assert res.p_value == pytest.approx(min(1.0, 1 / lr), rel=1e-12)
    half = float(msprt_halfwidth(res.se**2, 0.5, 0.05))
    assert (res.ci_low, res.ci_high) == pytest.approx((res.estimate - half, res.estimate + half))
    # Always-valid intervals pay for peeking: wider than the fixed-horizon Welch interval.
    assert res.ci_high - res.ci_low > welch.ci_high - welch.ci_low
    assert res.decision == ("reject_null" if res.p_value < 0.05 else "fail_to_reject")


def test_snapshot_p_value_is_capped_at_one_without_signal() -> None:
    res = msprt_test([1.0, 2.0, 3.0, 4.0], [1.0, 2.0, 3.0, 4.0], tau=1.0)
    assert res.estimate == 0.0
    assert res.p_value == 1.0
    assert res.decision == "fail_to_reject"


def test_sequence_takes_running_minimum_p_and_intersects_intervals() -> None:
    estimates = np.array([0.30, 0.05, 0.20, -0.10])
    variances = np.array([0.04, 0.02, 0.01, 0.005])
    seq = msprt_sequence(estimates, variances, tau=0.2, alpha=0.05)
    snapshot_p = np.minimum(1.0, 1 / msprt_likelihood_ratio(estimates, variances, 0.2))
    assert seq.p_value == pytest.approx(np.minimum.accumulate(snapshot_p))
    half = msprt_halfwidth(variances, 0.2, 0.05)
    assert seq.ci_low == pytest.approx(np.maximum.accumulate(estimates - half))
    assert seq.ci_high == pytest.approx(np.minimum.accumulate(estimates + half))
    assert np.all(np.diff(seq.p_value) <= 0)
    assert np.all(np.diff(seq.ci_low) >= 0) and np.all(np.diff(seq.ci_high) <= 0)
    assert seq.rejected.tolist() == (seq.p_value < 0.05).tolist()


def test_sequence_runs_along_the_last_axis_for_many_experiments() -> None:
    estimates = np.array([[0.1, 0.2, 0.3], [0.0, 0.0, 0.0]])
    variances = np.full((2, 3), 0.01)
    seq = msprt_sequence(estimates, variances, tau=0.2)
    assert seq.p_value.shape == (2, 3)
    single = msprt_sequence(estimates[0], variances[0], tau=0.2)
    assert seq.p_value[0] == pytest.approx(single.p_value)
    assert seq.ci_low[0] == pytest.approx(single.ci_low)


@pytest.mark.parametrize(
    ("estimate", "variance", "tau", "alpha", "match"),
    [
        (0.1, 0.0, 0.2, 0.05, "variance"),
        (0.1, -1.0, 0.2, 0.05, "variance"),
        (np.nan, 0.01, 0.2, 0.05, "finite"),
        (0.1, 0.01, 0.0, 0.05, "tau"),
        (0.1, 0.01, math.inf, 0.05, "tau"),
        (0.1, 0.01, 0.2, 1.5, "alpha"),
        (np.zeros(3), np.ones(2), 0.2, 0.05, "shape"),
    ],
)
def test_sequence_rejects_bad_input(estimate, variance, tau, alpha, match) -> None:
    with pytest.raises(ValueError, match=match):
        msprt_sequence(np.atleast_1d(estimate), np.atleast_1d(variance), tau=tau, alpha=alpha)


def test_snapshot_rejects_zero_variance_groups() -> None:
    with pytest.raises(ValueError, match="variance"):
        msprt_test([1.0, 1.0], [1.0, 1.0], tau=1.0)
