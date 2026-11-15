"""abkit.readout.render_memo: the one-page Markdown readout (PR 15)."""

import pytest
from test_readout import _data, _params

from abkit.readout import render_memo, run_readout


def _memo(data, params, simulated=True, **kwargs):
    readout = run_readout(data, params)
    return readout, render_memo(readout, title="save-trip-cta-v1", simulated=simulated, **kwargs)


def test_ship_memo_states_the_decision_effect_interval_and_guardrail() -> None:
    r, memo = _memo(_data(lift=0.5), _params(), description="Bigger save button.")
    assert memo.startswith("# Readout: save-trip-cta-v1")
    assert "Bigger save button." in memo
    assert "## Decision: SHIP" in memo
    assert "Sample ratio check: PASS" in memo
    assert f"{r.primary.estimate:+.4g}" in memo
    assert f"[{r.primary.ci_low:+.4g}, {r.primary.ci_high:+.4g}]" in memo
    assert f"{r.primary.relative_lift:+.1%}" in memo
    assert "mean saves per user" in memo


def test_srm_memo_blocks_the_conclusion_and_prints_no_effect() -> None:
    data = _data(n_control=2000, n_treatment=1700, lift=5.0)
    r, memo = _memo(data, _params())
    assert "## Decision: CONCLUSION BLOCKED" in memo
    assert "Sample ratio check: FAIL" in memo
    assert "SHIP" not in memo.replace("CONCLUSION BLOCKED", "")
    # No effect numbers at all: no difference column, no interval, no lift.
    assert "Difference" not in memo and "95% CI" not in memo and "Relative lift" not in memo
    assert "2000" in memo and "1700" in memo  # the counts that broke the split are shown
    assert f"{r.srm.p_value:.2e}" in memo


def test_simulated_data_is_labelled_and_real_data_is_not() -> None:
    _, sim = _memo(_data(), _params(), simulated=True)
    _, real = _memo(_data(), _params(), simulated=False)
    assert "simulated" in sim.lower() and "virtual users" in sim
    assert "simulated" not in real.lower()


def test_harm_and_flat_memos_say_why_they_do_not_ship() -> None:
    _, harm = _memo(_data(lift=-0.5), _params())
    _, flat = _memo(_data(seed=3), _params())
    assert "## Decision: NO SHIP" in harm and "hurts" in harm
    assert "## Decision: NO SHIP" in flat and "detectable effect" in flat


def test_novelty_memo_warns_that_the_early_lift_faded() -> None:
    params = _params(early_metric={"kind": "mean", "column": "saves_early"})
    _, memo = _memo(_data(seed=3), params)
    assert "Early window" in memo and "novelty" in memo.lower()


def test_persona_memo_has_one_row_per_persona_and_the_q_test() -> None:
    lifts = {"browser": 0.0, "planner": 0.2, "power": 1.5}
    _, memo = _memo(_data(persona_lift=lifts), _params(by_persona=True))
    for persona in ("browser", "planner", "power"):
        assert f"| {persona} |" in memo
    assert "Cochran's Q" in memo


def test_peeking_memo_says_interim_looks_were_ignored() -> None:
    _, memo = _memo(_data(), _params(looks=[8, 9, 10], window_days=7))
    assert "3 interim looks" in memo and "planned horizon" in memo


@pytest.mark.parametrize("lift", [0.5, 0.0])
def test_memo_fits_on_one_page(lift) -> None:
    params = _params(by_persona=True, early_metric={"kind": "mean", "column": "saves_early"})
    _, memo = _memo(_data(lift=lift), params, description="x" * 200)
    assert len(memo.splitlines()) <= 60


def test_memo_states_the_srm_threshold_it_used() -> None:
    _, memo = _memo(_data(), _params())
    assert "blocked below p = 0.0005" in memo
