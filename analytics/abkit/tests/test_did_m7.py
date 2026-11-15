"""M7: DiD estimate, CI and pre-trend p on the Actions panel, with robustness (B2 plan, PR 19)."""

import math

import pytest

from abkit.did import m7
from abkit.did.actions import ACTIONS_PANEL_CSV
from abkit.runs import read_runs

SPEC_NAMES = (
    "main",
    "never_controls",
    "pr_weighted",
    "monthly",
    "monthly_median",
    "placebo_4q",
    "twfe_event",
    "twfe_static",
)
RUN_AT = "2026-11-13T00:00:00+00:00"


@pytest.fixture(scope="module")
def results() -> dict[str, m7.SpecResult]:
    return m7.run_specs(ACTIONS_PANEL_CSV)


def test_the_specs_are_fixed_before_looking_at_results() -> None:
    assert tuple(s.name for s in m7.SPECS) == SPEC_NAMES
    main = m7.SPECS[0]
    assert (main.estimator, main.period_months, main.pre, main.post) == ("sun_abraham", 3, 4, 4)
    assert (main.controls, main.weighted, main.outcome, main.placebo) == (
        "never_and_late",
        False,
        "mean_log1p",
        0,
    )
    by_name = {s.name: s for s in m7.SPECS}
    assert by_name["never_controls"].controls == "never"
    assert by_name["pr_weighted"].weighted is True
    assert (by_name["monthly"].period_months, by_name["monthly"].pre) == (1, 12)
    assert by_name["monthly_median"].outcome == "log1p_median"
    assert (by_name["placebo_4q"].placebo, by_name["placebo_4q"].post) == (4, 3)
    assert by_name["twfe_event"].estimator == "twfe_event_study"
    assert by_name["twfe_static"].estimator == "twfe_static"


def test_every_spec_runs_on_the_committed_panel(results) -> None:
    assert tuple(results) == SPEC_NAMES
    for name, result in results.items():
        assert math.isfinite(result.att.estimate) and result.att.se > 0, name
        assert result.att.ci_low < result.att.estimate < result.att.ci_high
        if name == "twfe_static":
            assert result.study is None
        else:
            assert 0 <= result.study.pretrend_p <= 1
    main = results["main"].study
    assert [e.rel for e in main.event_times] == [-4, -3, -2, 0, 1, 2, 3, 4]
    assert main.n_control_units == 190


def test_records_carry_estimate_ci_and_pretrend_p_per_spec(results) -> None:
    records = m7.m7_records(results, pr="19", git_sha="abc", run_at=RUN_AT)
    names = {r.metric: r for r in records}
    for spec in SPEC_NAMES:
        for stem in ("did_att", "did_att_ci95_low", "did_att_ci95_high", "did_att_p"):
            assert f"{stem}_{spec}" in names
        assert (f"did_pretrend_p_{spec}" in names) == (spec != "twfe_static")
    main = results["main"]
    assert names["did_att_main"].value == main.att.estimate
    assert names["did_att_pct_main"].value == pytest.approx(100 * math.expm1(main.att.estimate))
    assert names["did_pretrend_p_main"].value == main.study.pretrend_p
    events = [r for r in records if r.metric.startswith("did_event_main_l")]
    assert [r.metric for r in events] == [
        f"did_event_main_l{e.rel}" for e in main.study.event_times
    ]
    assert all(r.metric_id == "M7" and r.pr == "19" and not r.simulated for r in records)
    assert names["did_att_main"].n == main.study.n_treated_units + main.study.n_control_units
    assert "Sun & Abraham" in names["did_att_main"].notes


def test_main_dry_run_prints_without_writing(tmp_path, capsys) -> None:
    runs = tmp_path / "runs.csv"
    assert m7.main(["--runs", str(runs), "--dry-run", "--pr", "19"]) == 0
    assert not runs.exists()
    out = capsys.readouterr().out
    assert "did_att_main=" in out and "did_pretrend_p_main=" in out


def test_main_appends_the_rows(tmp_path) -> None:
    runs = tmp_path / "runs.csv"
    assert m7.main(["--runs", str(runs), "--pr", "19"]) == 0
    rows = read_runs(runs)
    assert {r.metric_id for r in rows} == {"M7"}
    assert any(r.metric == "did_att_main" for r in rows)
