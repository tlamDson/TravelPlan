"""Budget allocation: top-k by uplift (baseline) versus the LP solved by PuLP + CBC."""

import numpy as np
import pytest

from abkit.uplift.allocation import Allocation, greedy_allocation, lp_allocation, top_k


def test_top_k_treats_the_highest_scores_until_the_budget_runs_out() -> None:
    score = np.array([0.1, 0.5, 0.3, -0.2, 0.4])
    cost = np.array([1.0, 2.0, 1.0, 1.0, 2.0])
    alloc = top_k(score, cost, budget=4.5)
    # 0.5 (cost 2) then 0.4 (cost 2) fit; 0.3 would take the spend to 5.
    np.testing.assert_array_equal(alloc.treat, [0, 1, 0, 0, 1])
    assert alloc.cost == pytest.approx(4.0)
    assert alloc.uplift == pytest.approx(0.9)
    assert alloc.n_treated == 2


def test_greedy_is_the_fractional_knapsack_and_skips_negative_uplift() -> None:
    uplift = np.array([0.1, 0.5, 0.3, -0.2, 0.4])
    cost = np.array([1.0, 2.0, 1.0, 1.0, 2.0])
    alloc = greedy_allocation(uplift, cost, budget=4.5)
    # ratios 0.1, 0.25, 0.3, -, 0.2 -> take idx 2 (1), idx 1 (2), then 1.5/2 of idx 4.
    np.testing.assert_allclose(alloc.treat, [0, 1, 1, 0, 0.75])
    assert alloc.cost == pytest.approx(4.5)
    assert alloc.uplift == pytest.approx(0.3 + 0.5 + 0.75 * 0.4)
    big = greedy_allocation(uplift, cost, budget=100.0)
    np.testing.assert_array_equal(big.treat, [1, 1, 1, 0, 1])


def test_lp_matches_the_closed_form_optimum() -> None:
    rng = np.random.default_rng(0)
    uplift = rng.normal(0.001, 0.002, 3000)
    cost = rng.uniform(0.005, 0.2, 3000)
    budget = 0.1 * cost.sum()
    lp = lp_allocation(uplift, cost, budget)
    greedy = greedy_allocation(uplift, cost, budget)
    assert isinstance(lp, Allocation)
    assert lp.uplift == pytest.approx(greedy.uplift, rel=1e-6)
    assert lp.cost <= budget * (1 + 1e-9)
    assert np.all((lp.treat >= 0) & (lp.treat <= 1))
    assert np.all(lp.treat[uplift < 0] == 0)


def test_lp_beats_top_k_at_the_same_budget_when_costs_differ() -> None:
    uplift = np.array([1.0, 0.6, 0.6])
    cost = np.array([2.0, 1.0, 1.0])
    assert top_k(uplift, cost, 2.0).uplift == pytest.approx(1.0)
    assert lp_allocation(uplift, cost, 2.0).uplift == pytest.approx(1.2)


def test_lp_equals_top_k_when_every_cost_is_the_same() -> None:
    rng = np.random.default_rng(1)
    uplift = rng.normal(0.5, 1.0, 200)
    cost = np.ones(200)
    lp = lp_allocation(uplift, cost, 20.0)
    assert lp.uplift == pytest.approx(top_k(uplift, cost, 20.0).uplift)


def test_zero_budget_treats_nobody() -> None:
    uplift, cost = np.array([0.3, 0.1]), np.array([1.0, 1.0])
    for alloc in (top_k(uplift, cost, 0.0), lp_allocation(uplift, cost, 0.0)):
        assert alloc.n_treated == 0 and alloc.uplift == 0.0


@pytest.mark.parametrize("fn", [top_k, greedy_allocation, lp_allocation])
def test_allocations_reject_bad_input(fn) -> None:
    with pytest.raises(ValueError, match="cost"):
        fn(np.array([0.1, 0.2]), np.array([1.0, 0.0]), 1.0)
    with pytest.raises(ValueError, match="budget"):
        fn(np.array([0.1, 0.2]), np.array([1.0, 1.0]), -1.0)
    with pytest.raises(ValueError, match="same length"):
        fn(np.array([0.1, 0.2]), np.array([1.0]), 1.0)
    with pytest.raises(ValueError, match="finite"):
        fn(np.array([0.1, np.nan]), np.array([1.0, 1.0]), 1.0)
