"""The CUPED check on Hillstrom: bootstrap the 1/(1-R^2) promise and log M4 to runs.csv."""

import hashlib
from pathlib import Path

import numpy as np
import pytest
from conftest import GOLDEN_LATEST, write_hillstrom_like

import abkit.hillstrom
from abkit.cuped_check import HILLSTROM_OUTCOMES, bootstrap_cuped, hillstrom_runs, main
from abkit.golden.case import read_csv_columns
from abkit.runs import read_runs
from abkit.stats import cuped


def _strong(n: int = 1500, seed: int = 2):
    rng = np.random.default_rng(seed)
    x_c, x_t = rng.normal(0, 1, n), rng.normal(0, 1, n)
    y_c = 0.8 * x_c + rng.normal(0, 0.6, n)
    y_t = 0.2 + 0.8 * x_t + rng.normal(0, 0.6, n)
    return y_c, x_c, y_t, x_t


def test_bootstrap_recovers_the_predicted_variance_ratio() -> None:
    args = _strong()
    boot = bootstrap_cuped(*args, n_boot=1000, seed=1)
    full = cuped(*args)
    assert boot.n_boot == 1000 and boot.seed == 1
    assert boot.variance_reduction == pytest.approx(full.variance_reduction, rel=1e-12)
    assert boot.predicted_variance_ratio == pytest.approx(1 / full.sample_size_multiplier)
    assert boot.predicted_variance_ratio == pytest.approx(0.36, abs=0.04)
    # The ratio of two bootstrap variances is noisy: about +-0.02 (1 sd) at n_boot=1000 here.
    assert boot.bootstrap_variance_ratio == pytest.approx(boot.predicted_variance_ratio, abs=0.06)
    assert boot.ratio_ci_low < boot.bootstrap_variance_ratio < boot.ratio_ci_high
    assert boot.bootstrap_se_cuped == pytest.approx(full.se, rel=0.1)
    assert boot.analytic_se_cuped == pytest.approx(full.se, rel=1e-12)
    # Replicates centre on the sample, so the mean shift is the sample's own adjustment.
    assert boot.mean_shift == pytest.approx(full.estimate - full.naive_estimate, abs=0.1 * full.se)


def test_bootstrap_is_reproducible_by_seed() -> None:
    args = _strong(n=300)
    a, b = bootstrap_cuped(*args, n_boot=50, seed=3), bootstrap_cuped(*args, n_boot=50, seed=3)
    assert a == b
    assert bootstrap_cuped(*args, n_boot=50, seed=4) != a


def test_bootstrap_needs_at_least_two_replicates() -> None:
    with pytest.raises(ValueError, match="n_boot"):
        bootstrap_cuped(*_strong(n=50), n_boot=1)


def test_on_hillstrom_visits_the_bootstrap_agrees_with_one_minus_r_squared() -> None:
    """Mens E-Mail vs No E-Mail, visit adjusted by recency (the committed G-public data)."""
    data = read_csv_columns(GOLDEN_LATEST / "hillstrom/mens-visit/data.csv")
    is_t = data["variant"] == "treatment"
    y, x = data["value"], data["covariate"]
    boot = bootstrap_cuped(y[~is_t], x[~is_t], y[is_t], x[is_t], n_boot=300, seed=11)
    # Recency is a weak covariate: R^2 well under 1%, so the multiplier is close to 1.
    assert 0.003 < boot.variance_reduction < 0.01
    assert boot.bootstrap_variance_ratio == pytest.approx(boot.predicted_variance_ratio, abs=0.02)
    assert boot.bootstrap_se_cuped == pytest.approx(boot.analytic_se_cuped, rel=0.1)


def test_hillstrom_runs_logs_three_m4_rows_per_outcome(tmp_path: Path) -> None:
    path = write_hillstrom_like(tmp_path / "h.csv", n=900)
    records = hillstrom_runs(path, n_boot=40, seed=7, pr="11", git_sha="abc", expected_sha256=None)
    assert HILLSTROM_OUTCOMES == {"visit": "recency", "spend": "history"}
    assert [r.metric for r in records] == [
        f"hillstrom_{outcome}_cuped_{what}"
        for outcome in HILLSTROM_OUTCOMES
        for what in ("variance_reduction", "sample_size_multiplier", "bootstrap_variance_ratio")
    ]
    assert {r.metric_id for r in records} == {"M4"}
    assert all(r.simulated is False and r.pr == "11" and r.git_sha == "abc" for r in records)
    assert all(r.n == 600 and r.seed == "7" for r in records)  # Mens + No E-Mail rows
    r2, multiplier, ratio = records[:3]
    assert multiplier.value == pytest.approx(1 / (1 - r2.value), rel=1e-9)
    assert "n_boot=40" in ratio.notes and "predicted=" in ratio.notes
    assert "covariate=recency" in r2.notes


def test_main_appends_to_the_ledger_and_checks_the_file(tmp_path: Path, monkeypatch) -> None:
    path = write_hillstrom_like(tmp_path / "h.csv", n=300)
    runs = tmp_path / "runs.csv"
    argv = [str(path), "--pr", "11", "--n-boot", "20", "--runs-csv", str(runs)]
    with pytest.raises(ValueError, match="sha256"):
        main(argv)
    monkeypatch.setattr(
        abkit.hillstrom, "HILLSTROM_SHA256", hashlib.sha256(path.read_bytes()).hexdigest()
    )
    assert main([*argv, "--dry-run"]) == 0
    assert not runs.exists()
    assert main(argv) == 0
    assert len(read_runs(runs)) == 6
