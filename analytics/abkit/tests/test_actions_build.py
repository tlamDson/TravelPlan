import csv
import json
from pathlib import Path

import pytest
from gh_fixtures import FakeGh, raw_commit, raw_pr, raw_search

import abkit.actions.gh as gh_module
from abkit.actions.build import BuildConfig, build_actions_panel, summary_records
from abkit.actions.gh import GhClient
from abkit.cli import main
from abkit.runs import read_runs

REPOS = {
    "o/adopter": ("2015-01-05T00:00:00Z", ["2018-02-01T00:00:00Z"]),
    "o/never": ("2015-01-06T00:00:00Z", []),
    "o/gone": ("2015-01-07T00:00:00Z", None),
}


def _fake() -> FakeGh:
    routes = {
        "search/repositories": lambda p: raw_search(
            *[
                {"full_name": n, "created_at": c, "stargazers_count": 200}
                for n, (c, _) in REPOS.items()
            ]
        )
    }
    for name, (_, commits) in REPOS.items():
        if commits is None:
            continue
        routes[f"repos/{name}/commits"] = lambda p, c=commits: [raw_commit(d) for d in c]
        routes[f"repos/{name}/pulls"] = lambda p: [
            raw_pr("2018-01-02T00:00:00Z", "2018-01-02T04:00:00Z"),
            raw_pr("2018-03-02T00:00:00Z", "2018-03-03T00:00:00Z"),
        ]
    return FakeGh(routes)


def _config(out: Path, n: int = 3) -> BuildConfig:
    return BuildConfig(
        n=n,
        seed=18,
        frame_from="2015-01",
        frame_to="2015-01",
        start="2018-01",
        end="2018-03",
        out_dir=out,
    )


def test_build_writes_panel_repos_and_meta(tmp_path: Path) -> None:
    client = GhClient(tmp_path / "cache", runner=_fake(), sleep=lambda s: None)
    summary = build_actions_panel(client, _config(tmp_path / "out"), progress=lambda m: None)
    assert (summary.frame_size, summary.sampled, summary.missing) == (3, 3, 1)
    assert (summary.in_panel, summary.adopters_in_window, summary.merged_prs) == (2, 1, 4)

    with (tmp_path / "out/panel.csv").open(encoding="utf-8", newline="") as fh:
        panel = list(csv.DictReader(fh))
    assert [(r["repo"], r["month"], r["treated"]) for r in panel] == [
        ("o/adopter", "2018-01", "0"),
        ("o/adopter", "2018-02", "1"),
        ("o/adopter", "2018-03", "1"),
        ("o/never", "2018-01", "0"),
        ("o/never", "2018-02", "0"),
        ("o/never", "2018-03", "0"),
    ]
    with (tmp_path / "out/repos.csv").open(encoding="utf-8", newline="") as fh:
        repos = {r["repo"]: r for r in csv.DictReader(fh)}
    assert repos["o/gone"]["status"] == "missing"
    assert repos["o/adopter"]["adoption_at"] == "2018-02-01T00:00:00Z"
    meta = json.loads((tmp_path / "out/meta.json").read_text(encoding="utf-8"))
    assert (meta["seed"], meta["n"], meta["frame_size"]) == (18, 3, 3)
    assert meta["queries"] == ["stars:100..2000 fork:false created:2015-01-01..2015-01-31"]


def test_a_rerun_is_served_from_the_cache(tmp_path: Path) -> None:
    fake = _fake()
    counts = []
    for _ in range(2):
        client = GhClient(tmp_path / "cache", runner=fake, sleep=lambda s: None)
        build_actions_panel(client, _config(tmp_path / "out"), progress=lambda m: None)
        counts.append(len(fake.calls))
    assert counts[0] > 0
    assert counts[1] == counts[0]
    assert client.calls == 0


def test_summary_records_are_real_not_simulated(tmp_path: Path) -> None:
    client = GhClient(tmp_path / "cache", runner=_fake(), sleep=lambda s: None)
    summary = build_actions_panel(client, _config(tmp_path / "out"), progress=lambda m: None)
    records = summary_records(summary, pr="18", git_sha="abc", run_at="2026-11-13T00:00:00+00:00")
    by_metric = {r.metric: r for r in records}
    assert by_metric["actions_panel_repos"].value == 2
    assert by_metric["actions_panel_adopters"].value == 1
    assert by_metric["actions_panel_merged_prs"].value == 4
    assert all(r.simulated is False and r.seed == "18" for r in records)


def test_cli_builds_the_panel_and_records_runs(tmp_path: Path, monkeypatch, capsys) -> None:
    monkeypatch.setattr(gh_module, "run_gh", _fake())
    runs = tmp_path / "runs.csv"
    code = main(
        [
            "actions-panel",
            "--cache", str(tmp_path / "cache"),
            "--out", str(tmp_path / "out"),
            "--n", "3",
            "--frame-from", "2015-01",
            "--frame-to", "2015-01",
            "--start", "2018-01",
            "--end", "2018-03",
            "--record", "--pr", "18", "--runs-csv", str(runs),
        ]
    )  # fmt: skip
    assert code == 0
    assert (tmp_path / "out/panel.csv").exists()
    assert "actions_panel_repos=2" in capsys.readouterr().out
    assert {r.metric for r in read_runs(runs)} >= {"actions_panel_repos"}


def test_cli_exits_2_when_the_sample_is_larger_than_the_frame(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    monkeypatch.setattr(gh_module, "run_gh", _fake())
    code = main(["actions-panel", "--cache", str(tmp_path), "--out", str(tmp_path / "o"),
                 "--n", "9", "--frame-from", "2015-01", "--frame-to", "2015-01"])  # fmt: skip
    assert code == 2
    assert "frame" in capsys.readouterr().err


BAD_MONTHS = [["--start", "2018-13"], ["--start", "2019-01", "--end", "2018-01"]]


@pytest.mark.parametrize("bad", BAD_MONTHS)
def test_cli_rejects_bad_months(tmp_path: Path, bad: list[str]) -> None:
    assert main(["actions-panel", "--cache", str(tmp_path), *bad]) == 2
