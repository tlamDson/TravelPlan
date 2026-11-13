import numpy as np
import pytest

from abkit.forecast.backtest import mape, rolling_origin
from abkit.forecast.models import Forecast, SeasonalNaive


class _Spy:
    """Forecasts the last value +/- 1 and records every history it was given."""

    name = "spy"

    def __init__(self) -> None:
        self.histories: list[np.ndarray] = []

    def forecast(self, y: np.ndarray, horizon: int, level: float) -> Forecast:
        self.histories.append(np.array(y, copy=True))
        mean = np.full(horizon, y[-1])
        return Forecast(mean=mean, lower=mean - 1, upper=mean + 1, level=level, spec="spy")


def test_rolling_origin_fits_on_the_past_only_at_each_origin() -> None:
    y = np.arange(1.0, 21.0)
    spy = _Spy()
    result = rolling_origin(y, spy, horizon=3, initial=10, step=2, level=0.9)
    # Origins 10, 12, 14, 16 (16 + 3 = 19 <= 20); 18 would run past the end.
    assert result.origins == (10, 12, 14, 16)
    assert [len(h) for h in spy.histories] == [10, 12, 14, 16]
    for origin, history in zip(result.origins, spy.histories, strict=True):
        np.testing.assert_array_equal(history, y[:origin])
    assert len(result.points) == 4 * 3
    first = result.points[:3]
    assert [(p.origin, p.step) for p in first] == [(10, 1), (10, 2), (10, 3)]
    assert [p.actual for p in first] == [11.0, 12.0, 13.0]
    assert all(p.mean == 10.0 for p in first)
    assert result.model == "spy"
    assert result.level == 0.9


def test_score_reports_mape_coverage_and_width() -> None:
    y = np.arange(1.0, 21.0)
    result = rolling_origin(y, _Spy(), horizon=3, initial=10, step=2, level=0.9)
    score = result.score()
    errors = [(o + s - (o)) / (o + s) for o in (10, 12, 14, 16) for s in (1, 2, 3)]
    assert score.mape == pytest.approx(100 * np.mean(errors))
    # Last value +/- 1 only covers the 1-step-ahead point: 1 of 3 per origin.
    assert score.coverage == pytest.approx(1 / 3)
    assert score.mean_width == pytest.approx(2.0)
    assert score.n_points == 12
    assert score.n_zero_excluded == 0
    assert score.n_origins == 4


def test_mape_skips_zero_actuals_and_counts_them() -> None:
    value, excluded = mape(np.array([0.0, 2.0, 4.0]), np.array([5.0, 1.0, 5.0]))
    assert value == pytest.approx(100 * (0.5 + 0.25) / 2)
    assert excluded == 1


def test_mape_of_only_zero_actuals_is_undefined() -> None:
    with pytest.raises(ValueError, match="zero"):
        mape(np.zeros(3), np.ones(3))


@pytest.mark.parametrize(
    ("kwargs", "match"),
    [
        ({"horizon": 0}, "horizon"),
        ({"initial": 0}, "initial"),
        ({"step": 0}, "step"),
        ({"initial": 19, "horizon": 3}, "no origin"),
    ],
)
def test_rolling_origin_rejects_bad_windows(kwargs: dict, match: str) -> None:
    params = {"horizon": 3, "initial": 10, "step": 1, "level": 0.95, **kwargs}
    with pytest.raises(ValueError, match=match):
        rolling_origin(np.arange(1.0, 21.0), _Spy(), **params)


def test_seasonal_naive_interval_covers_close_to_nominal_on_its_own_process() -> None:
    # A seasonal random walk is exactly the process seasonal naive assumes, so its 95% interval
    # should cover about 95% of the points: this checks interval and backtest together.
    rng = np.random.default_rng(7)
    y = np.empty(7 * 60)
    y[:7] = 100 + np.arange(7)
    for t in range(7, len(y)):
        y[t] = y[t - 7] + rng.normal(0, 1)
    score = rolling_origin(y, SeasonalNaive(), horizon=7, initial=70, step=7).score()
    assert 0.90 <= score.coverage <= 0.99
