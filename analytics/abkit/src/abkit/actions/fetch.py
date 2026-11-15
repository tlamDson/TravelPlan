"""The repositories of the GitHub Actions panel and what is read about each one.

Sampling frame: public non-fork repositories in a star band, one search query per
creation month (the first ``pages`` pages of 100 results each; GitHub search returns at
most 1,000 per query). The sample is drawn with a seed from the frame sorted by name,
so the same frame and seed give the same repositories.

Adoption is the committer date of the oldest commit on the default branch that touches
``.github/workflows``. PRs are the closed pull requests, newest first, read back to the
start of the window or until ``max_pages`` (then ``truncated``); only merged ones are
kept, with bot authors flagged rather than dropped. A bot is a user of type ``Bot`` or a
login ending in ``[bot]`` (GitHub App accounts); a deleted (ghost) author is not a bot.
The projections below turn raw GitHub answers into the few fields kept in the cache.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from abkit.actions.gh import GhClient, GhError, Projection

WORKFLOWS_PATH = ".github/workflows"


def is_bot(user: dict[str, Any] | None) -> bool:
    if not user:
        return False
    return user.get("type") == "Bot" or str(user.get("login", "")).endswith("[bot]")


def project_search(raw: dict[str, Any]) -> list[dict[str, Any]]:
    keep = ("full_name", "created_at", "stargazers_count")
    return [{k: item[k] for k in keep} for item in raw["items"]]


def project_commits(raw: list[dict[str, Any]]) -> list[str]:
    return [c["commit"]["committer"]["date"] for c in raw]


def project_pulls(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"created_at": p["created_at"], "merged_at": p["merged_at"], "bot": is_bot(p["user"])}
        for p in raw
    ]


SEARCH = Projection("search/v1", project_search)
COMMITS = Projection("commit-dates/v1", project_commits)
PULLS = Projection("pulls/v2", project_pulls)


@dataclass
class RepoRecord:
    full_name: str
    created_at: str
    stars: int
    status: str  # "ok" or "missing"
    adoption_at: str | None = None
    prs: list[dict[str, Any]] = field(default_factory=list)
    truncated: bool = False


def frame_query(month: str, min_stars: int, max_stars: int) -> str:
    year, mon = (int(part) for part in month.split("-"))
    last = calendar.monthrange(year, mon)[1]
    return f"stars:{min_stars}..{max_stars} fork:false " f"created:{month}-01..{month}-{last:02d}"


def build_frame(
    client: GhClient,
    months: list[str],
    min_stars: int = 100,
    max_stars: int = 2000,
    pages: int = 1,
) -> list[dict[str, Any]]:
    by_name: dict[str, dict[str, Any]] = {}
    for month in months:
        query = frame_query(month, min_stars, max_stars)
        for page in range(1, pages + 1):
            items = client.get(
                "search/repositories",
                {"q": query, "per_page": "100", "page": str(page)},
                project=SEARCH,
            )
            for item in items:
                by_name.setdefault(item["full_name"], item)
            if len(items) < 100:
                break
    return [by_name[name] for name in sorted(by_name)]


def sample_repos(frame: list[dict[str, Any]], n: int, seed: int) -> list[dict[str, Any]]:
    if n > len(frame):
        raise ValueError(f"cannot sample {n} repositories from a frame of {len(frame)}")
    ordered = sorted(frame, key=lambda r: r["full_name"])
    picks = np.random.default_rng(seed).choice(len(ordered), size=n, replace=False)
    return [ordered[i] for i in sorted(picks.tolist())]


def first_workflow_commit(
    client: GhClient, full_name: str, per_page: int = 100, max_pages: int = 50
) -> str | None:
    oldest: str | None = None
    for page in range(1, max_pages + 1):
        try:
            dates = client.get(
                f"repos/{full_name}/commits",
                {"path": WORKFLOWS_PATH, "per_page": str(per_page), "page": str(page)},
                project=COMMITS,
            )
        except GhError as err:
            if err.status == 409:  # an empty repository has no commits
                return None
            raise
        if dates:
            page_oldest = min(dates)
            oldest = page_oldest if oldest is None else min(oldest, page_oldest)
        if len(dates) < per_page:
            break
    return oldest


def merged_prs(
    client: GhClient, full_name: str, since: str, per_page: int = 100, max_pages: int = 30
) -> tuple[list[dict[str, Any]], bool]:
    """Merged PRs created in or after month ``since`` (``YYYY-MM``), and ``truncated``."""
    kept: list[dict[str, Any]] = []
    for page in range(1, max_pages + 1):
        rows = client.get(
            f"repos/{full_name}/pulls",
            {
                "state": "closed",
                "sort": "created",
                "direction": "desc",
                "per_page": str(per_page),
                "page": str(page),
            },
            project=PULLS,
        )
        in_window = [r for r in rows if r["created_at"][:7] >= since]
        kept += [r for r in in_window if r["merged_at"]]
        if len(rows) < per_page or len(in_window) < len(rows):
            return kept, False
    return kept, True


def fetch_repo(
    client: GhClient, repo: dict[str, Any], since: str, max_pr_pages: int = 30
) -> RepoRecord:
    name = repo["full_name"]
    record = RepoRecord(name, repo["created_at"], int(repo["stargazers_count"]), "ok")
    try:
        record.adoption_at = first_workflow_commit(client, name)
        record.prs, record.truncated = merged_prs(client, name, since, max_pages=max_pr_pages)
    except GhError as err:
        if err.status not in (404, 410, 451):
            raise
        return RepoRecord(name, repo["created_at"], int(repo["stargazers_count"]), "missing")
    return record
