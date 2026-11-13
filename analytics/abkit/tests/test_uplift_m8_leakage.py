"""M8 must not leak: models see only train rows, and held-out labels only score policies."""

from dataclasses import replace

import numpy as np
import pytest
from criteo_fixtures import criteo_like_rows

from abkit.criteo import CriteoSample
from abkit.uplift import m8
from abkit.uplift.m8 import PolicyOutcome, evaluate_seed

SEED = 3
PLANNED = ("budget", "topk_planned_uplift", "topk_planned_cost", "topk_treated")
PLANNED += ("lp_planned_uplift", "lp_planned_cost", "lp_treated")


def _sample(n: int = 6_000, seed: int = 0, row_ids: bool = False) -> CriteoSample:
    rows = criteo_like_rows(n, seed)
    features = rows[:, :12].astype(np.float32)
    if row_ids:
        features[:, 0] = np.arange(n)  # exact in float32, so a model can report its rows
    return CriteoSample(
        features=features,
        treatment=rows[:, 12].astype(np.int8),
        conversion=rows[:, 13].astype(np.int8),
        visit=rows[:, 14].astype(np.int8),
        exposure=rows[:, 15].astype(np.int8),
        fraction=1.0,
        seed=seed,
        source_rows=n,
        source_sha256="0" * 64,
    )


def _ids(x: np.ndarray) -> set[int]:
    return {int(v) for v in x[:, 0]}


@pytest.fixture
def spied(monkeypatch: pytest.MonkeyPatch) -> dict[str, list]:
    """Replace the cost model and the learners by fakes that record the rows they get."""
    calls: dict[str, list] = {"cost_fit": [], "cost_predict": [], "fit": [], "predict": []}

    class SpyCost:
        def fit(self, x, y):
            calls["cost_fit"].append((_ids(x), y.copy()))
            return self

        def predict(self, x):
            calls["cost_predict"].append(_ids(x))
            return np.full(len(x), 0.5)

    class SpyLearner:
        def fit(self, x, treatment, y):
            calls["fit"].append((_ids(x), treatment.copy(), y.copy()))
            return self

        def predict(self, x):
            calls["predict"].append(_ids(x))
            return np.linspace(0.0, 0.01, len(x))

    monkeypatch.setattr(m8, "LogisticRegression", SpyCost)
    monkeypatch.setattr(m8, "LEARNERS", {"t": SpyLearner, "x": SpyLearner})
    return calls


def test_learners_fit_on_train_rows_and_predict_only_held_out_rows(spied: dict) -> None:
    sample = _sample(row_ids=True)
    outcomes = evaluate_seed(sample, SEED, budget_shares=(0.2,), test_share=0.3)
    everyone = set(range(len(sample)))
    assert len(spied["fit"]) == len(spied["predict"]) == 2  # T and X
    for (fit_ids, _, _), predict_ids in zip(spied["fit"], spied["predict"], strict=True):
        assert fit_ids.isdisjoint(predict_ids)
        assert fit_ids | predict_ids == everyone
        assert len(predict_ids) == outcomes[0].n_test
    assert 0.25 < outcomes[0].n_test / len(sample) < 0.35


def test_cost_model_fits_on_treated_train_rows_and_prices_only_held_out_rows(spied: dict) -> None:
    sample = _sample(row_ids=True)
    evaluate_seed(sample, SEED, budget_shares=(0.2,), learners=("t",))
    ((cost_fit_ids, cost_y),), (cost_predict_ids,) = spied["cost_fit"], spied["cost_predict"]
    train_ids, test_ids = spied["fit"][0][0], spied["predict"][0]
    treated = {int(i) for i in np.flatnonzero(sample.treatment == 1)}
    assert cost_fit_ids == train_ids & treated
    assert cost_predict_ids == test_ids
    assert cost_fit_ids.isdisjoint(test_ids)
    rows = np.array(sorted(cost_fit_ids))
    assert sorted(cost_y) == sorted(sample.exposure[rows].astype(float))


def test_every_seed_holds_out_different_rows(spied: dict) -> None:
    sample = _sample(row_ids=True)
    for seed in (0, 1):
        evaluate_seed(sample, seed, budget_shares=(0.2,), learners=("t",))
    first, second = spied["predict"]
    assert first != second
    for (fit_ids, _, _), predict_ids in zip(spied["fit"], spied["predict"], strict=True):
        assert fit_ids.isdisjoint(predict_ids)


def _planned(outcomes: list[PolicyOutcome]) -> list[tuple]:
    return [tuple(getattr(o, name) for name in PLANNED) for o in outcomes]


def _flip(sample: CriteoSample, rows: np.ndarray) -> CriteoSample:
    conversion, exposure = sample.conversion.copy(), sample.exposure.copy()
    conversion[rows] = 1 - conversion[rows]
    exposure[rows] = 1 - exposure[rows]
    return replace(sample, conversion=conversion, exposure=exposure)


def test_held_out_labels_change_the_score_but_never_the_plan() -> None:
    sample = _sample()
    held_out = np.random.default_rng(SEED).random(len(sample)) < m8.TEST_SHARE
    base = evaluate_seed(sample, SEED, budget_shares=(0.2,))
    assert base[0].n_test == held_out.sum()

    test_flipped = evaluate_seed(_flip(sample, held_out), SEED, budget_shares=(0.2,))
    assert _planned(test_flipped) == _planned(base)  # scores and costs never saw these labels
    assert [o.topk_value for o in test_flipped] != [o.topk_value for o in base]

    train_flipped = evaluate_seed(_flip(sample, ~held_out), SEED, budget_shares=(0.2,))
    assert _planned(train_flipped) != _planned(base)  # the check above can fail
    for before, after in zip(base, train_flipped, strict=True):
        assert after.random_value == before.random_value  # scored on held-out labels only
