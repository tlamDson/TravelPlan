import math

import numpy as np
import pytest
from scipy.stats import norm

from abkit.forecast.models import (
    ARIMA,
    ETS,
    MODELS,
    Forecast,
    ForecastError,
    SeasonalNaive,
)

WEEK = np.array([10.0, 12.0, 14.0, 13.0, 11.0, 6.0, 5.0])


def _seasonal_trend(n: int, noise: float, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    return 100.0 + 0.5 * t + np.tile(WEEK, n // 7 + 1)[:n] + rng.normal(0, noise, n)


def test_registry_lists_the_three_models_by_name() -> None:
    assert set(MODELS) == {"seasonal_naive", "ets", "arima"}
    for name, factory in MODELS.items():
        assert factory().name == name


def test_seasonal_naive_repeats_the_last_season() -> None:
    y = np.concatenate([WEEK, WEEK + 1.0, WEEK + 2.0])
    fc = SeasonalNaive(period=7).forecast(y, horizon=10, level=0.95)
    np.testing.assert_array_equal(fc.mean, np.concatenate([WEEK + 2.0, (WEEK + 2.0)[:3]]))
    assert fc.level == 0.95


def test_seasonal_naive_interval_uses_seasonal_residuals_and_widens_each_season() -> None:
    y = np.concatenate([WEEK, WEEK + 1.0, WEEK + 3.0])  # residuals: 1 (x7), 2 (x7)
    fc = SeasonalNaive(period=7).forecast(y, horizon=8, level=0.90)
    sigma = math.sqrt((7 * 1.0 + 7 * 4.0) / 14)
    z = norm.ppf(0.95)
    half = fc.upper - fc.mean
    np.testing.assert_allclose(half[:7], z * sigma)
    np.testing.assert_allclose(half[7], z * sigma * math.sqrt(2))
    np.testing.assert_allclose(fc.mean - fc.lower, half)


def test_seasonal_naive_needs_more_than_one_season() -> None:
    with pytest.raises(ForecastError, match="at least"):
        SeasonalNaive(period=7).forecast(WEEK, horizon=1, level=0.95)


@pytest.mark.parametrize("bad", [0.0, 1.0, -0.5, 1.5])
def test_level_must_be_strictly_between_zero_and_one(bad: float) -> None:
    with pytest.raises(ValueError, match="level"):
        SeasonalNaive().forecast(np.tile(WEEK, 3), horizon=1, level=bad)


def test_horizon_must_be_positive() -> None:
    with pytest.raises(ValueError, match="horizon"):
        SeasonalNaive().forecast(np.tile(WEEK, 3), horizon=0, level=0.95)


def test_non_finite_history_is_rejected() -> None:
    y = np.tile(WEEK, 3)
    y[4] = np.nan
    with pytest.raises(ValueError, match="finite"):
        ETS().forecast(y, horizon=1, level=0.95)


@pytest.mark.parametrize("model", [ETS(), ARIMA()], ids=["ets", "arima"])
def test_models_track_a_trend_with_weekly_season(model) -> None:
    y = _seasonal_trend(70, noise=0.3)
    truth = _seasonal_trend(84, noise=0.0)[70:]
    fc = model.forecast(y, horizon=14, level=0.95)
    assert isinstance(fc, Forecast)
    assert fc.mean.shape == fc.lower.shape == fc.upper.shape == (14,)
    assert np.all(fc.lower < fc.mean) and np.all(fc.mean < fc.upper)
    # Truth with no noise: a model that missed the trend or the season is off by >5%.
    mape = np.mean(np.abs(fc.mean - truth) / truth) * 100
    assert mape < 1.5, f"{model.name} {fc.spec}: MAPE {mape:.2f}%"
    assert fc.spec  # which candidate was chosen, for the run notes


def test_ets_picks_a_seasonal_candidate_when_the_season_is_strong() -> None:
    fc = ETS().forecast(_seasonal_trend(70, noise=0.3), horizon=7, level=0.95)
    assert "seasonal=add" in fc.spec


def test_ets_skips_seasonal_candidates_on_short_history() -> None:
    fc = ETS(period=7).forecast(_seasonal_trend(14, noise=0.3), horizon=3, level=0.95)
    assert "seasonal=none" in fc.spec


def test_arima_differences_a_trending_series_and_not_white_noise() -> None:
    trend = ARIMA().forecast(_seasonal_trend(70, noise=0.3), horizon=7, level=0.95)
    flat = ARIMA().forecast(np.random.default_rng(1).normal(50, 2, 70), horizon=7, level=0.95)
    assert "d=1" in trend.spec
    assert "d=0" in flat.spec


def test_interval_level_controls_width() -> None:
    y = _seasonal_trend(70, noise=1.0)
    for model in (SeasonalNaive(), ETS(), ARIMA()):
        wide = model.forecast(y, horizon=7, level=0.95)
        narrow = model.forecast(y, horizon=7, level=0.80)
        assert np.all(wide.upper - wide.lower > narrow.upper - narrow.lower), model.name
