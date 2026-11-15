"""M6: ATE error of naive, IPW and AIPW on biased resamples of an RCT (B2 plan, PR 17)."""

from pathlib import Path

import numpy as np
import pytest
from conftest import GOLDEN_LATEST
from test_causal_hillstrom import HEADER, _synthetic

from abkit.causal import m6
from abkit.runs import read_runs

METHODS = ("naive_diff", "ipw", "aipw")


def _rct_with_effect(n: int = 30_000, seed: int = 4) -> dict[str, np.ndarray]:
    """Visit probability rises with the selection score, and the email adds 4 points."""
    data = _synthetic(n, seed)
    rng = np.random.default_rng(seed + 1)
    z = (data["log_history"] - data["log_history"].mean()) / data["log_history"].std()
    p = np.clip(0.10 + 0.06 * z - 0.015 * (data["recency"] - 6) + 0.04 * data["treatment"], 0, 1)
    data["outcome"] = (rng.random(n) < p).astype(float)
    return data


def test_replicate_finds_naive_biased_and_ipw_aipw_close_to_the_rct_benchmark() -> None:
    data = _rct_with_effect()
    study = m6.replicate(data, reps=20, seed=0, strength=1.0)
    benchmark = (
        data["outcome"][data["treatment"] == 1].mean()
        - data["outcome"][data["treatment"] == 0].mean()
    )
    assert study.benchmark == pytest.approx(benchmark, rel=1e-12)
    assert set(study.estimates) == set(METHODS)
    assert all(len(v) == 20 for v in study.estimates.values())
    summary = {s.method: s for s in m6.summarize(study)}
    assert summary["naive_diff"].bias > 0.02
    for method in ("ipw", "aipw"):
        assert abs(summary[method].bias) < 0.005
        assert summary[method].rmse < summary["naive_diff"].rmse / 3
    assert 0.0 <= summary["aipw"].coverage <= 1.0
    assert summary["naive_diff"].coverage < 0.2


def test_replicate_is_reproducible_for_a_seed() -> None:
    data = _rct_with_effect(5_000)
    first = m6.replicate(data, reps=3, seed=9, strength=1.0)
    second = m6.replicate(data, reps=3, seed=9, strength=1.0)
    assert first.estimates["aipw"] == second.estimates["aipw"]


def test_records_are_m6_rows_in_percentage_points_on_real_users() -> None:
    data = _rct_with_effect(5_000)
    study = m6.replicate(data, reps=3, seed=9, strength=1.0)
    run_at = "2026-11-13T00:00:00+00:00"
    records = m6.hillstrom_records(study, pr="17", git_sha="abc", run_at=run_at)
    by_metric = {r.metric: r for r in records}
    assert {r.metric_id for r in records} == {"M6"}
    assert not any(r.simulated for r in records)
    for method in METHODS:
        for stat in ("bias", "rmse", "mean_abs_error", "ci95_coverage"):
            assert f"hillstrom_ate_{stat}_{method}" in by_metric
    rmse = {s.method: s.rmse for s in m6.summarize(study)}
    assert by_metric["hillstrom_ate_rmse_ipw"].value == pytest.approx(100 * rmse["ipw"])
    assert by_metric["hillstrom_ate_rmse_ipw"].unit == "pp"
    assert by_metric["hillstrom_ate_benchmark"].value == pytest.approx(100 * study.benchmark)
    assert by_metric["hillstrom_ate_rmse_ipw"].n == 3
    assert by_metric["hillstrom_ate_rmse_ipw"].seed == "9"


def test_lalonde_records_measure_each_method_against_the_experimental_benchmark() -> None:
    records = m6.lalonde_records(
        GOLDEN_LATEST, pr="17", git_sha="abc", run_at="2026-11-13T00:00:00+00:00"
    )
    by_metric = {r.metric: r for r in records}
    assert set(by_metric) == {f"lalonde_psid_att_error_{m}" for m in METHODS}
    assert by_metric["lalonde_psid_att_error_naive_diff"].value == pytest.approx(-16999, abs=1)
    assert by_metric["lalonde_psid_att_error_ipw"].unit == "USD"
    assert all(r.n == 2675 and not r.simulated for r in records)


def test_cli_dry_run_prints_rows_and_writes_nothing(tmp_path: Path, capsys) -> None:
    data = _rct_with_effect(3_000)
    csv_path = tmp_path / "hillstrom.csv"
    _write_hillstrom_csv(csv_path, data)
    runs = tmp_path / "runs.csv"
    args = ["--hillstrom", str(csv_path), "--reps", "2", "--pr", "17", "--runs", str(runs)]
    code = m6.main([*args, "--dry-run"])
    assert code == 0
    assert not runs.exists()
    assert "hillstrom_ate_rmse_aipw" in capsys.readouterr().out


def test_cli_appends_hillstrom_and_lalonde_rows(tmp_path: Path) -> None:
    data = _rct_with_effect(3_000)
    csv_path = tmp_path / "hillstrom.csv"
    _write_hillstrom_csv(csv_path, data)
    runs = tmp_path / "runs.csv"
    assert m6.main(["--hillstrom", str(csv_path), "--reps", "2", "--runs", str(runs)]) == 0
    metrics = {r.metric for r in read_runs(runs)}
    assert "hillstrom_ate_bias_naive_diff" in metrics
    assert "lalonde_psid_att_error_aipw" in metrics


def _write_hillstrom_csv(path: Path, data: dict[str, np.ndarray]) -> None:
    """Back-translate synthetic columns into the raw Hillstrom spelling."""
    lines = [HEADER.rstrip("\n")]
    for i in range(data["treatment"].size):
        channel = (
            "Web"
            if data["channel_web"][i]
            else "Multichannel"
            if data["channel_multichannel"][i]
            else "Phone"
        )
        zip_code = (
            "Urban" if data["zip_urban"][i] else "Rural" if data["zip_rural"][i] else "Surburban"
        )
        segment = "Womens E-Mail" if data["treatment"][i] else "No E-Mail"
        history = float(np.expm1(data["log_history"][i]))
        lines.append(
            f"{int(data['recency'][i])},x,{history!r},{int(data['mens'][i])},"
            f"{int(data['womens'][i])},{zip_code},{int(data['newbie'][i])},{channel},{segment},"
            f"{int(data['outcome'][i])},0,0"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
