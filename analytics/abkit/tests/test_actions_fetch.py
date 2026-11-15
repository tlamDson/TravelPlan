from pathlib import Path

import pytest
from gh_fixtures import Completed, FakeGh, pages, pr, raw_commit, raw_pr, raw_search

from abkit.actions.fetch import (
    build_frame,
    fetch_repo,
    first_workflow_commit,
    frame_query,
    is_bot,
    merged_prs,
    project_pulls,
    sample_repos,
)
from abkit.actions.gh import GhClient
from abkit.actions.panel import build_panel


def _client(tmp_path: Path, fake: FakeGh) -> GhClient:
    return GhClient(tmp_path / "cache", runner=fake, sleep=lambda s: None)


def _repo(name: str, created: str = "2015-03-02T00:00:00Z", stars: int = 150) -> dict:
    return {"full_name": name, "created_at": created, "stargazers_count": stars}


def test_frame_query_covers_one_creation_month_and_a_star_band() -> None:
    assert frame_query("2016-02", 100, 2000) == (
        "stars:100..2000 fork:false created:2016-02-01..2016-02-29"
    )


def test_build_frame_merges_months_dedups_and_sorts_by_name(tmp_path: Path) -> None:
    by_month = {
        "created:2015-01-01..2015-01-31": [_repo("z/z"), _repo("b/b")],
        "created:2015-02-01..2015-02-28": [_repo("a/a"), _repo("b/b")],
    }

    def search(params):
        assert params["per_page"] == "100"
        return raw_search(*next(v for k, v in by_month.items() if k in params["q"]))

    client = _client(tmp_path, FakeGh({"search/repositories": search}))
    frame = build_frame(client, ["2015-01", "2015-02"], min_stars=100, max_stars=2000)
    assert [r["full_name"] for r in frame] == ["a/a", "b/b", "z/z"]
    assert frame[0] == _repo("a/a")  # only the kept fields, not the raw search item


def test_sample_repos_is_seeded_and_order_free() -> None:
    frame = [_repo(f"o/r{i:03d}") for i in range(50)]
    first = sample_repos(frame, 10, seed=18)
    assert first == sample_repos(list(reversed(frame)), 10, seed=18)
    assert first != sample_repos(frame, 10, seed=19)
    assert len({r["full_name"] for r in first}) == 10


def test_sample_repos_refuses_more_than_the_frame() -> None:
    with pytest.raises(ValueError, match="frame"):
        sample_repos([_repo("a/a")], 2, seed=1)


def test_first_workflow_commit_is_the_oldest_over_every_page(tmp_path: Path) -> None:
    dates = [f"2021-01-{d:02d}T00:00:00Z" for d in range(28, 0, -1)]  # newest first
    calls: list[dict] = []

    def commits(params):
        assert params["path"] == ".github/workflows"
        calls.append(params)
        return pages([raw_commit(d) for d in dates], per_page=int(params["per_page"]))(params)

    client = _client(tmp_path, FakeGh({"repos/o/r/commits": commits}))
    assert first_workflow_commit(client, "o/r", per_page=10) == "2021-01-01T00:00:00Z"
    assert [c["page"] for c in calls] == ["1", "2", "3"]


def test_no_workflow_commit_and_an_empty_repo_mean_never_adopted(tmp_path: Path) -> None:
    client = _client(
        tmp_path,
        FakeGh(
            {
                "repos/o/none/commits": lambda p: [],
                "repos/o/empty/commits": lambda p: Completed(
                    1, "", "Git Repository is empty. (HTTP 409)"
                ),
            }
        ),
    )
    assert first_workflow_commit(client, "o/none") is None
    assert first_workflow_commit(client, "o/empty") is None


def test_merged_prs_pages_newest_first_and_stops_before_the_window(tmp_path: Path) -> None:
    prs = [
        raw_pr("2019-06-03T00:00:00Z", "2019-06-04T00:00:00Z"),
        raw_pr("2019-06-02T00:00:00Z", None),
        raw_pr("2019-06-01T00:00:00Z", "2019-06-01T05:00:00Z", user_type="Bot"),
        raw_pr("2017-12-30T00:00:00Z", "2017-12-31T00:00:00Z"),
        raw_pr("2017-12-01T00:00:00Z", "2017-12-02T00:00:00Z"),
    ]
    seen: list[str] = []

    def pulls(params):
        assert (params["state"], params["sort"], params["direction"]) == (
            "closed",
            "created",
            "desc",
        )
        seen.append(params["page"])
        return pages(prs, per_page=int(params["per_page"]))(params)

    client = _client(tmp_path, FakeGh({"repos/o/r/pulls": pulls}))
    got, truncated = merged_prs(client, "o/r", since="2018-01", per_page=2, max_pages=10)
    assert got == [  # merged and created in the window, bots kept and flagged
        pr("2019-06-03T00:00:00Z", "2019-06-04T00:00:00Z", bot=False),
        pr("2019-06-01T00:00:00Z", "2019-06-01T05:00:00Z", bot=True),
    ]
    assert truncated is False
    assert seen == ["1", "2"]


def test_merged_prs_flags_truncation_when_the_page_cap_hits(tmp_path: Path) -> None:
    prs = [
        raw_pr(f"2020-05-{d:02d}T00:00:00Z", f"2020-05-{d:02d}T01:00:00Z") for d in range(9, 0, -1)
    ]
    client = _client(tmp_path, FakeGh({"repos/o/r/pulls": pages(prs)}))
    got, truncated = merged_prs(client, "o/r", since="2018-01", per_page=2, max_pages=2)
    assert len(got) == 4
    assert truncated is True


def test_fetch_repo_marks_a_vanished_repo_missing(tmp_path: Path) -> None:
    record = fetch_repo(_client(tmp_path, FakeGh({})), _repo("o/gone"), since="2018-01")
    assert record.status == "missing"
    assert record.prs == []


def test_fetch_repo_combines_adoption_and_prs(tmp_path: Path) -> None:
    fake = FakeGh(
        {
            "repos/o/r/commits": lambda p: [raw_commit("2020-02-10T00:00:00Z")],
            "repos/o/r/pulls": lambda p: [
                raw_pr("2020-01-05T00:00:00Z", "2020-01-06T00:00:00Z"),
                raw_pr("2020-01-07T00:00:00Z", "2020-01-08T00:00:00Z", login="renovate[bot]"),
            ],
        }
    )
    record = fetch_repo(_client(tmp_path, fake), _repo("o/r", stars=321), since="2018-01")
    assert record.status == "ok"
    assert record.adoption_at == "2020-02-10T00:00:00Z"
    assert record.stars == 321
    assert record.prs == [
        pr("2020-01-05T00:00:00Z", "2020-01-06T00:00:00Z", bot=False),
        pr("2020-01-07T00:00:00Z", "2020-01-08T00:00:00Z", bot=True),
    ]


@pytest.mark.parametrize(
    ("user", "expected"),
    [
        ({"login": "dependabot[bot]", "type": "Bot"}, True),
        ({"login": "renovate[bot]", "type": "User"}, True),  # a GitHub App seen as a user
        ({"login": "some-app", "type": "Bot"}, True),
        ({"login": "octocat", "type": "User"}, False),
        ({"login": "botanist", "type": "User"}, False),  # "bot" alone is not a bot
        ({"login": "acme", "type": "Organization"}, False),
        (None, False),  # a deleted (ghost) author
    ],
)
def test_is_bot_classifies_github_users(user, expected: bool) -> None:
    assert is_bot(user) is expected


def test_project_pulls_keeps_only_the_dates_and_the_bot_flag() -> None:
    raw = [
        raw_pr("2020-01-01T00:00:00Z", None, user_type="User"),
        raw_pr("2020-01-02T00:00:00Z", "2020-01-03T00:00:00Z", user_type="Bot"),
        {**raw_pr("2020-01-04T00:00:00Z", None), "user": None},
    ]
    assert project_pulls(raw) == [
        pr("2020-01-01T00:00:00Z", None, bot=False),
        pr("2020-01-02T00:00:00Z", "2020-01-03T00:00:00Z", bot=True),
        pr("2020-01-04T00:00:00Z", None, bot=False),
    ]


def test_bot_prs_never_count_as_merged_human_prs_in_the_panel(tmp_path: Path) -> None:
    dependabot = {"user_type": "Bot", "login": "dependabot[bot]"}
    fake = FakeGh(
        {
            "repos/o/r/commits": lambda p: [],
            "repos/o/r/pulls": lambda p: [
                raw_pr("2020-01-05T00:00:00Z", "2020-01-05T01:00:00Z", **dependabot),
                raw_pr("2020-01-06T00:00:00Z", "2020-01-06T03:00:00Z", login="renovate[bot]"),
                raw_pr("2020-01-07T00:00:00Z", "2020-01-07T09:00:00Z"),
            ],
        }
    )
    record = fetch_repo(_client(tmp_path, fake), _repo("o/r"), since="2020-01")
    (row,) = build_panel([record], "2020-01", "2020-01")
    assert (row["n_merged"], row["n_bot_merged"], row["median_merge_hours"]) == (1, 2, 9.0)
    assert record.truncated is False
