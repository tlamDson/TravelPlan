"""Point forecasts with prediction intervals: seasonal naive (baseline), ETS and ARIMA.

Each model has ``forecast(y, horizon, level) -> Forecast`` and refits from scratch on ``y``,
so a backtest can hand it any prefix of a series. ETS and ARIMA pick one candidate by AICc
(lowest wins) and say which in ``Forecast.spec``. They need ``statsmodels`` (the
``[forecast]`` extra); the seasonal naive baseline only needs numpy and scipy.

Seasonal naive interval (Hyndman & Athanasopoulos, *FPP3* 5.5): with ``e_t = y_t - y_{t-m}``
and ``sigma = sqrt(mean(e_t^2))``, step ``h`` has ``sigma_h = sigma * sqrt(floor((h-1)/m) + 1)``.
"""

from __future__ import annotations

import itertools
import math
import warnings
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

import numpy as np
from scipy.stats import norm

DEFAULT_PERIOD = 7  # daily data, weekly cycle


class ForecastError(ValueError):
    """The model cannot produce a forecast for this history."""


@dataclass(frozen=True)
class Forecast:
    mean: np.ndarray
    lower: np.ndarray
    upper: np.ndarray
    level: float
    spec: str  # the fitted candidate, e.g. "ETS(trend=add_damped, seasonal=add, m=7)"


class Model(Protocol):
    name: str

    def forecast(self, y: np.ndarray, horizon: int, level: float) -> Forecast: ...


def _check(y: np.ndarray, horizon: int, level: float) -> np.ndarray:
    if isinstance(horizon, bool) or not isinstance(horizon, int) or horizon < 1:
        raise ValueError(f"horizon must be a positive integer, got {horizon!r}")
    if not 0.0 < level < 1.0:
        raise ValueError(f"level must be strictly between 0 and 1, got {level!r}")
    y = np.asarray(y, dtype=float)
    if y.ndim != 1 or not np.all(np.isfinite(y)):
        raise ValueError("history must be a 1-D array of finite numbers")
    return y


def _finite(*arrays: np.ndarray) -> bool:
    return all(np.all(np.isfinite(a)) for a in arrays)


class SeasonalNaive:
    name = "seasonal_naive"

    def __init__(self, period: int = DEFAULT_PERIOD) -> None:
        self.period = period

    def forecast(self, y: np.ndarray, horizon: int, level: float = 0.95) -> Forecast:
        y = _check(y, horizon, level)
        m = self.period
        if len(y) < m + 1:
            raise ForecastError(f"seasonal naive needs at least {m + 1} points, got {len(y)}")
        steps = np.arange(horizon)
        last_season = y[-m:]
        mean = last_season[steps % m]
        residuals = y[m:] - y[:-m]
        sigma = math.sqrt(float(np.mean(residuals**2)))
        half = norm.ppf(0.5 + level / 2) * sigma * np.sqrt(steps // m + 1)
        return Forecast(mean, mean - half, mean + half, level, f"SNaive(m={m})")


def _best(candidates: list[tuple[str, Callable]], horizon: int, level: float, what: str):
    """Fit every candidate; return the finite Forecast with the lowest AICc."""
    best: tuple[float, Forecast] | None = None
    errors: list[str] = []
    for spec, fit in candidates:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                aicc, mean, interval = fit(horizon, 1.0 - level)
        except (ValueError, np.linalg.LinAlgError) as err:
            errors.append(f"{spec}: {err}")
            continue
        mean, interval = np.asarray(mean, dtype=float), np.asarray(interval, dtype=float)
        if not (math.isfinite(aicc) and _finite(mean, interval)):
            errors.append(f"{spec}: non-finite fit")
            continue
        if best is None or aicc < best[0]:
            best = (aicc, Forecast(mean, interval[:, 0], interval[:, 1], level, spec))
    if best is None:
        raise ForecastError(f"no {what} candidate could be fitted: {'; '.join(errors)}")
    return best[1]


class ETS:
    """Additive-error ETS; trend none / additive / damped, season none / additive, by AICc."""

    name = "ets"

    def __init__(self, period: int = DEFAULT_PERIOD) -> None:
        self.period = period

    def forecast(self, y: np.ndarray, horizon: int, level: float = 0.95) -> Forecast:
        import pandas as pd
        from statsmodels.tsa.exponential_smoothing.ets import ETSModel

        y = _check(y, horizon, level)
        # statsmodels 0.14 ETS prediction needs an indexed series (it fails on a bare ndarray).
        history = pd.Series(y)
        m = self.period
        seasons = ["none", "add"] if len(y) >= 3 * m else ["none"]
        trends = ["none", "add", "add_damped"]

        def fitter(trend: str, season: str) -> Callable:
            def fit(h: int, alpha: float):
                model = ETSModel(
                    history,
                    error="add",
                    trend=None if trend == "none" else "add",
                    damped_trend=trend == "add_damped",
                    seasonal=None if season == "none" else "add",
                    seasonal_periods=m if season != "none" else None,
                )
                result = model.fit(disp=False)
                pred = result.get_prediction(start=len(y), end=len(y) + h - 1)
                frame = pred.summary_frame(alpha=alpha)
                return result.aicc, frame["mean"], frame[["pi_lower", "pi_upper"]]

            return fit

        candidates = [
            (f"ETS(error=add, trend={t}, seasonal={s}, m={m})", fitter(t, s))
            for t, s in itertools.product(trends, seasons)
        ]
        return _best(candidates, horizon, level, "ETS")


def _kpss_order(y: np.ndarray) -> int:
    """1 when KPSS rejects level stationarity at 5% (as auto.arima does, at most once)."""
    from statsmodels.tsa.stattools import kpss

    if np.ptp(y) == 0:
        return 0
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # InterpolationWarning: p outside the lookup table
        _, p_value, *_ = kpss(y, regression="c", nlags="auto")
    return 1 if p_value < 0.05 else 0


class ARIMA:
    """ARIMA(p,d,q)(P,0,0)[m]: d by KPSS, then p+q <= max_order and P in {0,1} by AICc.

    d = 0 fits a constant, d = 1 a drift, so both forecast a level or a linear trend.
    """

    name = "arima"

    def __init__(self, period: int = DEFAULT_PERIOD, max_order: int = 2) -> None:
        self.period = period
        self.max_order = max_order

    def forecast(self, y: np.ndarray, horizon: int, level: float = 0.95) -> Forecast:
        from statsmodels.tsa.arima.model import ARIMA as StatsmodelsARIMA

        y = _check(y, horizon, level)
        m = self.period
        d = _kpss_order(y)
        trend = "t" if d == 1 else "c"
        seasonal = [0, 1] if len(y) >= 3 * m else [0]

        def fitter(p: int, q: int, big_p: int) -> Callable:
            def fit(h: int, alpha: float):
                model = StatsmodelsARIMA(
                    y, order=(p, d, q), seasonal_order=(big_p, 0, 0, m if big_p else 0), trend=trend
                )
                result = model.fit()
                pred = result.get_forecast(h)
                return result.aicc, pred.predicted_mean, pred.conf_int(alpha=alpha)

            return fit

        candidates = [
            (f"ARIMA(p={p}, d={d}, q={q})(P={sp}, m={m}) trend={trend}", fitter(p, q, sp))
            for p in range(self.max_order + 1)
            for q in range(self.max_order + 1 - p)
            for sp in seasonal
        ]
        return _best(candidates, horizon, level, "ARIMA")


MODELS: dict[str, Callable[[], Model]] = {
    SeasonalNaive.name: SeasonalNaive,
    ETS.name: ETS,
    ARIMA.name: ARIMA,
}
