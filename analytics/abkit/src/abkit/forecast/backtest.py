"""Rolling-origin backtest (time-series cross-validation, *FPP3* 5.10).

At each origin ``o`` in ``initial, initial + step, ...`` (while ``o + horizon <= len(y)``) the
model is refitted on ``y[:o]`` only and scored on ``y[o : o + horizon]``. Scores pool every
(origin, step) point: MAPE (zero actuals skipped and counted), the share of actuals inside the
prediction interval, and the mean interval width (coverage alone rewards wide intervals).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from abkit.forecast.models import Model


@dataclass(frozen=True)
class BacktestPoint:
    origin: int  # number of points the model was fitted on
    step: int  # 1 = first point after the origin
    actual: float
    mean: float
    lower: float
    upper: float


@dataclass(frozen=True)
class BacktestScore:
    mape: float  # percent
    coverage: float  # share in [0, 1]
    mean_width: float
    n_points: int
    n_zero_excluded: int  # points left out of MAPE because the actual was 0
    n_origins: int


@dataclass(frozen=True)
class BacktestResult:
    model: str
    horizon: int
    level: float
    origins: tuple[int, ...]
    points: tuple[BacktestPoint, ...]
    specs: tuple[str, ...]  # the candidate each origin's fit chose

    def score(self) -> BacktestScore:
        actual = np.array([p.actual for p in self.points])
        mean = np.array([p.mean for p in self.points])
        lower = np.array([p.lower for p in self.points])
        upper = np.array([p.upper for p in self.points])
        value, excluded = mape(actual, mean)
        return BacktestScore(
            mape=value,
            coverage=float(np.mean((lower <= actual) & (actual <= upper))),
            mean_width=float(np.mean(upper - lower)),
            n_points=len(self.points),
            n_zero_excluded=excluded,
            n_origins=len(self.origins),
        )


def mape(actual: np.ndarray, predicted: np.ndarray) -> tuple[float, int]:
    """Mean absolute percentage error over non-zero actuals, and how many zeros were skipped."""
    actual, predicted = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    keep = actual != 0
    if not keep.any():
        raise ValueError("MAPE is undefined: every actual is zero")
    ape = np.abs(actual[keep] - predicted[keep]) / np.abs(actual[keep])
    return float(100 * np.mean(ape)), int((~keep).sum())


def _positive(name: str, value: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(f"{name} must be a positive integer, got {value!r}")


def rolling_origin(
    y: np.ndarray,
    model: Model,
    horizon: int = 7,
    initial: int = 28,
    step: int = 1,
    level: float = 0.95,
) -> BacktestResult:
    for name, value in (("horizon", horizon), ("initial", initial), ("step", step)):
        _positive(name, value)
    y = np.asarray(y, dtype=float)
    origins = tuple(range(initial, len(y) - horizon + 1, step))
    if not origins:
        raise ValueError(
            f"no origin: initial={initial} + horizon={horizon} exceeds {len(y)} points"
        )
    points: list[BacktestPoint] = []
    specs: list[str] = []
    for origin in origins:
        fc = model.forecast(y[:origin], horizon, level)
        specs.append(fc.spec)
        for k in range(horizon):
            points.append(
                BacktestPoint(
                    origin=origin,
                    step=k + 1,
                    actual=float(y[origin + k]),
                    mean=float(fc.mean[k]),
                    lower=float(fc.lower[k]),
                    upper=float(fc.upper[k]),
                )
            )
    return BacktestResult(model.name, horizon, level, origins, tuple(points), tuple(specs))
