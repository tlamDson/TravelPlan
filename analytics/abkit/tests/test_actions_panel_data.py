"""The committed Actions panel (``analytics/data/actions_panel``) matches its meta and runs.csv."""

import csv
import json

from conftest import REPO_ROOT

from abkit.actions.build import REPOS_COLUMNS
from abkit.actions.cli import ACTIONS_PANEL_DIR
from abkit.actions.panel import PANEL_COLUMNS
from abkit.runs import read_runs


def _table(name: str) -> list[dict[str, str]]:
    with (ACTIONS_PANEL_DIR / name).open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def test_the_default_panel_dir_is_committed_under_analytics_data() -> None:
    assert ACTIONS_PANEL_DIR == REPO_ROOT / "analytics/data/actions_panel"


def test_the_committed_panel_is_the_400_repo_seed_18_sample() -> None:
    meta = json.loads((ACTIONS_PANEL_DIR / "meta.json").read_text(encoding="utf-8"))
    assert (meta["n"], meta["seed"], meta["sampled"]) == (400, 18, 400)
    assert (meta["start"], meta["end"]) == ("2018-01", "2022-12")
    repos = _table("repos.csv")
    assert tuple(repos[0]) == REPOS_COLUMNS
    assert len({r["repo"] for r in repos}) == 400
    panel = _table("panel.csv")
    assert tuple(panel[0]) == PANEL_COLUMNS
    assert len(panel) == meta["panel_rows"]
    assert len({r["repo"] for r in panel}) == meta["in_panel"]
    assert {r["repo"] for r in panel} <= {r["repo"] for r in repos}
    assert sum(int(r["n_merged"]) for r in panel) == meta["merged_prs"]


def test_runs_csv_holds_the_panel_counts() -> None:
    meta = json.loads((ACTIONS_PANEL_DIR / "meta.json").read_text(encoding="utf-8"))
    rows = {r.metric: r for r in read_runs() if r.pr == "18"}
    assert rows["actions_panel_repos"].value == meta["in_panel"]
    assert rows["actions_panel_adopters"].value == meta["adopters_in_window"]
    assert rows["actions_panel_merged_prs"].value == meta["merged_prs"]
    assert all(not r.simulated for r in rows.values())
