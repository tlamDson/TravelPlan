"""abkit.readout.run_readout: SRM first, then one decision on the primary metric (PR 15)."""

import numpy as np
import pytest
from scipy import stats

from abkit.readout import ReadoutSpec, run_readout

PERSONAS = ("browser", "planner", "power")


def _params(**overrides):
    params = {
        "alpha": 0.05,
        "srm_threshold": 0.0005,
        "expected_shares": {"control": 0.5, "treatment": 0.5},
        "metric": {"kind": "mean", "column": "saves"},
    }
    params.update(overrides)
    return params


def _data(n_control=2000, n_treatment=2000, lift=0.0, seed=1, persona_lift=None):
    rng = np.random.default_rng(seed)
    variant = np.array(["control"] * n_control + ["treatment"] * n_treatment)
    persona = np.array([PERSONAS[i % 3] for i in range(variant.size)])
    base = rng.poisson(3.0, variant.size).astype(np.float64)
    effect = np.full(variant.size, lift)
    if persona_lift is not None:
        effect = np.array([persona_lift[p] for p in persona])
    saves = base + (variant == "treatment") * effect
    views = base + rng.poisson(4.0, variant.size) + 1.0
    early = saves + (variant == "treatment") * 2.0
    day = rng.integers(0, 7, variant.size).astype(np.float64)
    return {
        "variant": variant,
        "persona": persona,
        "saves": saves,
        "views": views,
        "saves_early": early,
        "exposure_day": day,
    }


def test_balanced_split_with_a_clear_lift_ships() -> None:
    data = _data(lift=0.5)
    r = run_readout(data, _params())
    assert not r.blocked
    assert r.counts == {"control": 2000, "treatment": 2000}
    assert r.decision == "ship"
    assert r.verdict == "ship"
    c, t = data["saves"][:2000], data["saves"][2000:]
    ref = stats.ttest_ind(t, c, equal_var=False)
    assert r.primary.estimate == pytest.approx(t.mean() - c.mean(), abs=1e-12)
    assert r.primary.p_value == pytest.approx(ref.pvalue, rel=1e-9)
    assert r.primary.control_value == pytest.approx(c.mean())
    assert r.primary.treatment_value == pytest.approx(t.mean())
    assert r.primary.relative_lift == pytest.approx((t.mean() - c.mean()) / c.mean())
    assert r.primary.ci_low < r.primary.estimate < r.primary.ci_high


def test_sample_ratio_mismatch_blocks_the_conclusion_and_withholds_effects() -> None:
    data = _data(n_control=2000, n_treatment=1700, lift=5.0)
    r = run_readout(data, _params())
    assert r.srm.p_value < 0.0005
    assert r.blocked
    assert r.decision == "invalid"
    assert r.verdict == "invalid"
    # A huge lift must not leak out when the split is broken.
    assert r.primary is None and r.early is None and r.personas == ()


def test_srm_uses_the_planned_shares_not_an_even_split() -> None:
    data = _data(n_control=1000, n_treatment=3000)
    shares = {"control": 0.25, "treatment": 0.75}
    r = run_readout(data, _params(expected_shares=shares))
    assert not r.blocked
    assert r.srm.p_value == pytest.approx(1.0)


def test_a_significant_drop_is_no_ship_with_a_harm_verdict() -> None:
    r = run_readout(_data(lift=-0.5), _params())
    assert r.decision == "no_ship"
    assert r.verdict == "harm"


def test_no_effect_is_no_ship_flat() -> None:
    r = run_readout(_data(lift=0.0, seed=3), _params())
    assert r.primary.p_value >= 0.05
    assert (r.decision, r.verdict) == ("no_ship", "flat")


def test_ratio_metric_uses_the_delta_method() -> None:
    data = _data(lift=0.4)
    metric = {"kind": "ratio", "numerator": "saves", "denominator": "views"}
    r = run_readout(data, _params(metric=metric))
    ctrl, treat = data["variant"] == "control", data["variant"] == "treatment"
    r_c = data["saves"][ctrl].sum() / data["views"][ctrl].sum()
    r_t = data["saves"][treat].sum() / data["views"][treat].sum()
    assert r.primary.control_value == pytest.approx(r_c)
    assert r.primary.estimate == pytest.approx(r_t - r_c)
    assert r.primary.mde is None  # the t-test MDE does not apply to a ratio
    assert r.decision == "ship"


def test_mean_metric_reports_the_detectable_effect_at_80_percent_power() -> None:
    r = run_readout(_data(), _params())
    sd = np.sqrt(3.0)  # Poisson(3)
    # d ≈ 2.8 / sqrt(n/2) for n = 2000 per arm, in units of the metric.
    assert r.primary.mde == pytest.approx(2.8 * sd * np.sqrt(2 / 2000), rel=0.08)


def test_novelty_early_window_is_reported_but_the_decision_uses_the_late_metric() -> None:
    params = _params(early_metric={"kind": "mean", "column": "saves_early"})
    r = run_readout(_data(lift=0.0, seed=3), params)
    assert r.early.p_value < 0.05 and r.early.estimate > 1.5
    assert r.decision == "no_ship"
    assert r.novelty_faded


def test_persona_breakdown_and_heterogeneity() -> None:
    lifts = {"browser": 0.0, "planner": 0.2, "power": 1.5}
    r = run_readout(
        _data(persona_lift=lifts, n_control=3000, n_treatment=3000), _params(by_persona=True)
    )
    assert [p.group for p in r.personas] == list(PERSONAS)
    assert r.personas[2].estimate > r.personas[0].estimate + 1.0
    assert r.heterogeneity_p is not None and r.heterogeneity_p < 0.05


def test_interim_looks_never_change_the_decision() -> None:
    data = _data(lift=0.0, seed=3)
    plain = run_readout(data, _params())
    peeked = run_readout(data, _params(looks=[3, 4, 5], window_days=2))
    assert peeked.primary == plain.primary
    assert peeked.decision == plain.decision
    assert peeked.spec.looks == (3, 4, 5)


def test_golden_outputs_hold_only_srm_and_decision_when_blocked() -> None:
    blocked = run_readout(_data(n_control=2000, n_treatment=1700), _params())
    assert blocked.golden_outputs() == {"srm": True, "decision": "invalid"}
    ok = run_readout(
        _data(lift=0.5),
        _params(by_persona=True, early_metric={"kind": "mean", "column": "saves_early"}),
    )
    out = ok.golden_outputs()
    assert out["srm"] is False and out["decision"] == "ship"
    assert out["estimate"] == ok.primary.estimate
    assert out["early_estimate"] == ok.early.estimate
    assert {k for k in out if k.startswith("estimate_")} == {f"estimate_{p}" for p in PERSONAS}


@pytest.mark.parametrize(
    ("params", "message"),
    [
        (_params(alpha=1.5), "alpha"),
        (_params(metric={"kind": "median", "column": "saves"}), "kind"),
        (_params(metric={"kind": "mean"}), "column"),
        (_params(metric={"kind": "mean", "column": "nope"}), "nope"),
        (_params(expected_shares={"control": 1.0}), "control"),
        (_params(looks=[3]), "window_days"),
        (_params(surprise=1), "surprise"),
    ],
)
def test_bad_params_raise(params, message) -> None:
    with pytest.raises(ValueError, match=message):
        run_readout(_data(), params)


def test_rows_in_an_unplanned_arm_raise() -> None:
    data = _data()
    data["variant"] = data["variant"].copy()
    data["variant"][0] = "holdout"
    with pytest.raises(ValueError, match="holdout"):
        run_readout(data, _params())


def test_spec_parses_params() -> None:
    spec = ReadoutSpec.from_params(_params(by_persona=True, looks=[8, 9], window_days=7))
    assert spec.metric.label == "mean saves per user"
    assert spec.by_persona and spec.looks == (8, 9) and spec.window_days == 7
    ratio = ReadoutSpec.from_params(
        _params(metric={"kind": "ratio", "numerator": "saves", "denominator": "views"})
    )
    assert ratio.metric.label == "saves / views (ratio of sums)"


def test_srm_blocks_at_srm_threshold_not_at_alpha() -> None:
    data = _data(n_control=2080, n_treatment=1925)  # chi-square ≈ 6.0, p ≈ 0.014
    default = run_readout(data, _params())
    assert 0.0005 < default.srm.p_value < 0.05
    assert not default.blocked and default.decision != "invalid"
    strict = run_readout(data, _params(srm_threshold=0.05))
    assert strict.blocked and strict.decision == "invalid"


def test_novelty_never_flags_a_readout_that_ships() -> None:
    params = _params(early_metric={"kind": "mean", "column": "saves_early"})
    r = run_readout(_data(lift=0.5), params)
    assert r.decision == "ship" and r.early.p_value < 0.05
    assert not r.novelty_faded


def test_a_persona_missing_from_one_arm_raises_value_error() -> None:
    data = _data()
    data["persona"] = data["persona"].copy()
    data["persona"][:3] = "solo"  # three control users, no treatment users
    with pytest.raises(ValueError, match="solo"):
        run_readout(data, _params(by_persona=True))


def test_effects_can_be_measured_for_a_blinded_readout_without_unblocking_it() -> None:
    data = _data(n_control=2000, n_treatment=1700, lift=5.0)
    r = run_readout(data, _params(), effects_when_blocked=True)
    assert r.blocked and r.decision == "invalid"
    assert r.primary is not None and r.primary.estimate == pytest.approx(5.0, abs=0.3)
    assert r.golden_outputs() == {"srm": True, "decision": "invalid"}


def test_measure_effect_is_the_primary_effect_on_a_subset_of_users() -> None:
    from abkit.readout import MetricSpec, measure_effect

    data = _data(lift=0.5)
    everyone = np.ones(4000, dtype=bool)
    spec = MetricSpec.from_params("metric", {"kind": "mean", "column": "saves"})
    full = measure_effect(spec, data, everyone, 0.05)
    assert full == run_readout(data, _params()).primary
    early = data["exposure_day"] < 3
    part = measure_effect(spec, data, early, 0.05)
    assert part.n_control + part.n_treatment == int(early.sum())
