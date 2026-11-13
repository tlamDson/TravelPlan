"""Reading the committed Actions panel into a DiD panel (B2 plan, PR 19)."""

import csv
import json
import math
from pathlib import Path

import numpy as np
import pytest

from abkit.actions.cli import ACTIONS_PANEL_DIR
from abkit.actions.panel import PANEL_COLUMNS
from abkit.did.actions import ACTIONS_PANEL_CSV, load_actions_panel
from abkit.did.panel import NEVER

# repo, month, n_merged, median hours, mean log1p hours, adoption month
ROWS = [
    ("never/a", "2018-01", 2, 3.0, 1.2, ""),
    ("never/a", "2018-02", 0, None, None, ""),
    ("never/a", "2018-04", 1, 5.0, 1.8, ""),
    ("adopt/b", "2018-01", 1, 10.0, 2.4, "2018-03"),
    ("adopt/b", "2018-02", 3, 4.0, 1.5, "2018-03"),
    ("adopt/b", "2018-03", 1, 1.0, 0.7, "2018-03"),
    ("adopt/b", "2018-06", 2, 2.0, 1.0, "2018-03"),
    ("late/c", "2018-02", 4, 8.0, 2.0, "2023-02"),
    ("late/c", "2018-05", 1, 6.0, 1.9, "2023-02"),
]


def _write(path: Path) -> Path:
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(PANEL_COLUMNS)
        for repo, month, n, median, mean, adoption in ROWS:
            writer.writerow(
                [repo, month, n, 0, "" if median is None else median, "" if mean is None else mean]
                + [adoption, "", ""]
            )
    return path


def test_the_default_path_is_the_committed_panel() -> None:
    assert ACTIONS_PANEL_CSV == ACTIONS_PANEL_DIR / "panel.csv"


def test_monthly_panel_drops_months_without_a_merged_pr_and_codes_cohorts(tmp_path) -> None:
    panel = load_actions_panel(_write(tmp_path / "p.csv"), period_months=1)
    assert panel.units == ("adopt/b", "late/c", "never/a")
    assert panel.n_obs == 8
    b = panel.unit == 0
    assert panel.time[b].tolist() == [0, 1, 2, 5]
    assert panel.y[b].tolist() == [2.4, 1.5, 0.7, 1.0]
    assert set(panel.cohort[b].tolist()) == {2}
    assert set(panel.cohort[panel.unit == 2].tolist()) == {NEVER}
    # 2023-02 is 61 months after 2018-01: a late adopter, a control inside the window
    assert set(panel.cohort[panel.unit == 1].tolist()) == {61}
    assert panel.is_late[panel.unit == 1].all()
    assert panel.weight.tolist() == [1.0] * 8


def test_never_controls_drop_the_late_adopters(tmp_path) -> None:
    panel = load_actions_panel(_write(tmp_path / "p.csv"), period_months=1, controls="never")
    assert panel.units == ("adopt/b", "never/a")


def test_weighted_panel_weights_a_month_by_its_merged_prs(tmp_path) -> None:
    panel = load_actions_panel(_write(tmp_path / "p.csv"), period_months=1, weighted=True)
    assert panel.weight[panel.unit == 0].tolist() == [1.0, 3.0, 1.0, 2.0]


def test_quarters_pool_months_as_the_pr_weighted_mean(tmp_path) -> None:
    panel = load_actions_panel(_write(tmp_path / "p.csv"), period_months=3, weighted=True)
    b = panel.unit == 0
    assert panel.time[b].tolist() == [0, 1]
    assert panel.y[b][0] == pytest.approx((1 * 2.4 + 3 * 1.5 + 1 * 0.7) / 5)
    assert panel.y[b][1] == pytest.approx(1.0)
    assert panel.weight[b].tolist() == [5.0, 2.0]
    assert set(panel.cohort[b].tolist()) == {0}  # 2018-03 falls in the first quarter
    assert set(panel.cohort[panel.unit == 1].tolist()) == {20}
    a = panel.unit == 2
    assert panel.y[a].tolist() == [pytest.approx(1.2), pytest.approx(1.8)]


def test_median_outcome_is_log1p_of_the_monthly_median(tmp_path) -> None:
    panel = load_actions_panel(_write(tmp_path / "p.csv"), period_months=1, outcome="log1p_median")
    assert panel.y[panel.unit == 0][0] == pytest.approx(math.log1p(10.0))


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"outcome": "log1p_median", "period_months": 3}, "median"),
        ({"outcome": "mean"}, "outcome"),
        ({"period_months": 0}, "period_months"),
        ({"controls": "all"}, "controls"),
    ],
)
def test_bad_options_are_rejected(tmp_path, kwargs, message) -> None:
    with pytest.raises(ValueError, match=message):
        load_actions_panel(_write(tmp_path / "p.csv"), **kwargs)


def test_the_committed_panel_loads_with_every_repo_and_adopter_of_its_meta() -> None:
    meta = json.loads((ACTIONS_PANEL_DIR / "meta.json").read_text(encoding="utf-8"))
    panel = load_actions_panel(period_months=1)
    assert panel.n_units == meta["in_panel"]
    treated = np.unique(panel.unit[~panel.is_control])
    assert treated.size == meta["adopters_in_window"]
    assert panel.time.max() == 59
