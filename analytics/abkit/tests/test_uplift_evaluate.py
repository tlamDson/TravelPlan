"""Off-policy value of a targeting policy on randomized data, and the per-arm summary."""

import numpy as np
import pytest

from abkit.uplift.evaluate import arm_summary, ipw_effects, policy_value


def test_treating_everyone_is_n_times_the_difference_in_means() -> None:
    rng = np.random.default_rng(0)
    t = (rng.random(1000) < 0.85).astype(float)
    y = (rng.random(1000) < 0.05 + 0.02 * t).astype(float)
    expected = 1000 * (y[t == 1].mean() - y[t == 0].mean())
    assert policy_value(np.ones(1000), y, t) == pytest.approx(expected, rel=1e-12)
    assert policy_value(np.zeros(1000), y, t) == 0.0


def test_ipw_effects_use_the_given_propensity() -> None:
    y = np.array([1.0, 0.0, 1.0, 1.0])
    t = np.array([1.0, 1.0, 0.0, 0.0])
    np.testing.assert_allclose(ipw_effects(y, t, propensity=0.8), [1.25, 0.0, -5.0, -5.0])


def test_policy_value_is_unbiased_for_the_incremental_outcome() -> None:
    """Treating only users with x > 0 gains sum(tau(x) for x > 0) on average."""
    rng = np.random.default_rng(1)
    n, reps = 4000, 300
    x = rng.normal(size=n)
    tau = 0.05 * (x > 0) - 0.02 * (x <= 0)
    policy = (x > 0).astype(float)
    truth = float(tau[x > 0].sum())
    values = []
    for _ in range(reps):
        t = (rng.random(n) < 0.85).astype(float)
        y = (rng.random(n) < 0.1 + t * tau).astype(float)
        values.append(policy_value(policy, y, t, propensity=0.85))
    se = np.std(values) / np.sqrt(reps)
    assert abs(np.mean(values) - truth) < 4 * se


def test_policy_value_rejects_bad_input() -> None:
    with pytest.raises(ValueError, match="policy"):
        policy_value(np.array([1.5, 0.0]), np.ones(2), np.array([1.0, 0.0]))
    with pytest.raises(ValueError, match="same length"):
        policy_value(np.ones(3), np.ones(2), np.array([1.0, 0.0]))
    with pytest.raises(ValueError, match="both arms"):
        ipw_effects(np.ones(2), np.ones(2))
    with pytest.raises(ValueError, match="propensity"):
        ipw_effects(np.ones(2), np.array([1.0, 0.0]), propensity=1.0)


def test_arm_summary_turns_per_arm_counts_into_rates_and_lifts() -> None:
    counts = {
        "control": {"n": 200, "visit": 10, "conversion": 2},
        "treatment": {"n": 800, "visit": 60, "conversion": 12},
    }
    s = arm_summary(counts)
    assert s["n_total"] == 1000
    assert s["treatment_ratio"] == pytest.approx(0.8)
    assert s["visit_rate"] == pytest.approx(0.07)
    assert s["conversion_rate"] == pytest.approx(0.014)
    assert s["ate_visit"] == pytest.approx(0.075 - 0.05)
    assert s["relative_uplift_visit"] == pytest.approx(0.5)
    assert s["ate_conversion"] == pytest.approx(0.015 - 0.01)
    assert s["relative_uplift_conversion"] == pytest.approx(0.5)


def test_arm_summary_needs_both_arms_with_users() -> None:
    with pytest.raises(ValueError, match="control"):
        arm_summary({"treatment": {"n": 5, "visit": 1, "conversion": 0}})
    with pytest.raises(ValueError, match="n"):
        arm_summary(
            {
                "control": {"n": 0, "visit": 0, "conversion": 0},
                "treatment": {"n": 5, "visit": 1, "conversion": 0},
            }
        )
