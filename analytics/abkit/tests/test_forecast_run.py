import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import pytest

from abkit.forecast.run import main
from abkit.runs import read_runs

WEEKLY = (1.0, 1.2, 1.3, 1.25, 1.1, 0.7, 0.6)


def _write_events(path: Path, prefix: str = "sim-u-", days: int = 42) -> Path:
    """Users active on a weekly cycle; every third active user also saves a trip."""
    rng = np.random.default_rng(3)
    start = datetime(2026, 1, 5, tzinfo=UTC)
    lines = []
    for day in range(days):
        dau = int(round(20 * WEEKLY[day % 7] + 0.2 * day + rng.normal(0, 1)))
        at = (start + timedelta(days=day, hours=12)).isoformat().replace("+00:00", "Z")
        for u in range(dau):
            name = "trip_saved" if u % 3 == 0 else "trip_viewed"
            lines.append(json.dumps({"userId": f"{prefix}{u:06d}", "occurredAt": at, "name": name}))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


ARGS = ["--horizon", "7", "--initial", "28", "--step", "7", "--models", "seasonal_naive,ets"]


def test_backtest_appends_m9_rows_for_each_series_and_model(tmp_path: Path, capsys) -> None:
    events = _write_events(tmp_path / "events.jsonl")
    ledger = tmp_path / "runs.csv"
    code = main(
        [str(events), "--simulated", "--pr", "21", "--seed", "42", "--runs-csv", str(ledger), *ARGS]
    )
    assert code == 0
    rows = read_runs(ledger)
    assert {(r.metric) for r in rows} == {
        f"forecast_{kind}_{series}_{model}"
        for kind in ("mape", "pi95_coverage")
        for series in ("dau", "contributors")
        for model in ("seasonal_naive", "ets")
    }
    assert all(r.metric_id == "M9" and r.pr == "21" and r.seed == "42" for r in rows)
    assert all(r.simulated is True for r in rows)
    mape_rows = [r for r in rows if r.metric.startswith("forecast_mape_")]
    assert all(r.unit == "%" and r.value > 0 for r in mape_rows)
    cov_rows = [r for r in rows if "coverage" in r.metric]
    assert all(r.unit == "share" and 0 <= r.value <= 1 for r in cov_rows)
    # 2 origins (28, 35) x 7 steps scored per row.
    assert all(r.n == 14 for r in rows)
    note = next(r.notes for r in rows if r.metric == "forecast_mape_dau_ets")
    assert "horizon=7" in note and "origins=2" in note and "spec=" in note
    out = capsys.readouterr().out
    assert "seasonal_naive" in out and "ets" in out


def test_dry_run_prints_without_writing(tmp_path: Path) -> None:
    events = _write_events(tmp_path / "events.jsonl")
    ledger = tmp_path / "runs.csv"
    assert main([str(events), "--simulated", "--dry-run", "--runs-csv", str(ledger), *ARGS]) == 0
    assert not ledger.exists()


def test_simulated_or_real_must_be_stated(tmp_path: Path) -> None:
    events = _write_events(tmp_path / "events.jsonl")
    with pytest.raises(SystemExit) as exc:
        main([str(events), "--dry-run", *ARGS])
    assert exc.value.code == 2


def test_real_is_refused_when_any_user_is_simulated(tmp_path: Path, capsys) -> None:
    events = _write_events(tmp_path / "events.jsonl")
    ledger = tmp_path / "runs.csv"
    assert main([str(events), "--real", "--runs-csv", str(ledger), *ARGS]) == 2
    assert "sim-" in capsys.readouterr().err
    assert not ledger.exists()


def test_real_events_are_recorded_as_not_simulated(tmp_path: Path) -> None:
    events = _write_events(tmp_path / "events.jsonl", prefix="a" * 58)
    ledger = tmp_path / "runs.csv"
    assert main([str(events), "--real", "--runs-csv", str(ledger), *ARGS]) == 0
    assert all(r.simulated is False for r in read_runs(ledger))


def test_unknown_model_is_a_usage_error(tmp_path: Path) -> None:
    events = _write_events(tmp_path / "events.jsonl")
    with pytest.raises(SystemExit) as exc:
        main([str(events), "--simulated", "--dry-run", "--models", "prophet"])
    assert exc.value.code == 2
