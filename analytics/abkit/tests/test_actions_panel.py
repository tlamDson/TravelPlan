import csv
import math
from pathlib import Path

import pytest
from gh_fixtures import pr

from abkit.actions.fetch import RepoRecord
from abkit.actions.panel import (
    PANEL_COLUMNS,
    build_panel,
    month_diff,
    months_between,
    write_panel,
)


def _record(**kw) -> RepoRecord:
    base = {
        "full_name": "o/r",
        "created_at": "2015-01-01T00:00:00Z",
        "stars": 100,
        "status": "ok",
        "adoption_at": None,
        "prs": [],
        "truncated": False,
    }
    return RepoRecord(**{**base, **kw})


def test_months_between_is_inclusive_across_years() -> None:
    assert months_between("2018-11", "2019-02") == ["2018-11", "2018-12", "2019-01", "2019-02"]
    assert month_diff("2020-03", "2019-12") == 3


def test_a_month_row_has_count_median_and_mean_log_hours_without_bots() -> None:
    prs = [
        pr("2018-01-03T00:00:00Z", "2018-01-03T02:00:00Z"),  # 2 h
        pr("2018-01-10T00:00:00Z", "2018-01-10T10:00:00Z"),  # 10 h
        pr("2018-01-20T00:00:00Z", "2018-01-30T00:00:00Z"),  # 240 h
        pr("2018-01-21T00:00:00Z", "2018-01-21T00:01:00Z", bot=True),
    ]
    rows = build_panel([_record(prs=prs)], "2018-01", "2018-02")
    jan, feb = rows
    assert (jan["month"], jan["n_merged"], jan["n_bot_merged"]) == ("2018-01", 3, 1)
    assert jan["median_merge_hours"] == 10.0
    expected = (math.log1p(2) + math.log1p(10) + math.log1p(240)) / 3
    assert jan["mean_log1p_merge_hours"] == pytest.approx(expected)
    assert (feb["n_merged"], feb["median_merge_hours"], feb["mean_log1p_merge_hours"]) == (
        0,
        None,
        None,
    )


def test_adoption_sets_event_time_and_treated() -> None:
    record = _record(
        adoption_at="2018-02-15T00:00:00Z",
        prs=[pr("2018-03-01T00:00:00Z", "2018-03-01T01:00:00Z")],
    )
    rows = build_panel([record], "2018-01", "2018-03")
    assert [(r["event_time"], r["treated"]) for r in rows] == [(-1, 0), (0, 1), (1, 1)]
    assert {r["adoption_month"] for r in rows} == {"2018-02"}


def test_a_never_adopter_has_no_event_time() -> None:
    rows = build_panel(
        [_record(prs=[pr("2018-01-01T00:00:00Z", "2018-01-01T01:00:00Z")])], "2018-01", "2018-01"
    )
    assert (rows[0]["adoption_month"], rows[0]["event_time"], rows[0]["treated"]) == (
        None,
        None,
        0,
    )


def test_rows_start_at_the_repo_creation_and_after_a_truncated_month() -> None:
    young = _record(
        full_name="o/young",
        created_at="2018-02-20T00:00:00Z",
        prs=[pr("2018-03-01T00:00:00Z", "2018-03-02T00:00:00Z")],
    )
    capped = _record(
        full_name="o/capped",
        truncated=True,
        prs=[
            pr("2018-02-05T00:00:00Z", "2018-02-06T00:00:00Z"),
            pr("2018-03-05T00:00:00Z", "2018-03-06T00:00:00Z"),
        ],
    )
    rows = build_panel([young, capped], "2018-01", "2018-03")
    assert [(r["repo"], r["month"]) for r in rows] == [
        ("o/capped", "2018-03"),
        ("o/young", "2018-02"),
        ("o/young", "2018-03"),
    ]


def test_missing_repos_and_repos_without_a_merged_pr_in_the_window_are_left_out() -> None:
    rows = build_panel(
        [
            _record(full_name="o/gone", status="missing"),
            _record(full_name="o/quiet", prs=[]),
            _record(
                full_name="o/bots",
                prs=[pr("2018-01-01T00:00:00Z", "2018-01-01T01:00:00Z", bot=True)],
            ),
        ],
        "2018-01",
        "2018-02",
    )
    assert rows == []


def test_write_panel_writes_the_columns_with_blank_missing_values(tmp_path: Path) -> None:
    rows = build_panel(
        [_record(prs=[pr("2018-01-01T00:00:00Z", "2018-01-01T03:00:00Z")])], "2018-01", "2018-02"
    )
    path = tmp_path / "panel.csv"
    write_panel(rows, path)
    with path.open(encoding="utf-8", newline="") as fh:
        table = list(csv.reader(fh))
    assert tuple(table[0]) == PANEL_COLUMNS
    feb = dict(zip(PANEL_COLUMNS, table[2], strict=True))
    assert (feb["n_merged"], feb["median_merge_hours"], feb["adoption_month"]) == ("0", "", "")
