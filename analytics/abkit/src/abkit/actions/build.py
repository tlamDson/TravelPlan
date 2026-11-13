"""Build the Actions panel end to end: frame -> seeded sample -> fetch -> panel files.

Writes three files to ``out_dir``: ``panel.csv`` (repo x month, see ``panel.py``),
``repos.csv`` (one row per sampled repository, also the missing ones) and ``meta.json``
(seed, window, frame queries and counts), so the panel can be rebuilt from the cache.
"""

from __future__ import annotations

import csv
import json
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from abkit.actions.fetch import RepoRecord, build_frame, fetch_repo, frame_query, sample_repos
from abkit.actions.gh import GhClient
from abkit.actions.panel import build_panel, months_between, write_panel
from abkit.runs import RunRecord

REPOS_COLUMNS = ("repo", "created_at", "stars", "status", "adoption_at", "n_merged", "truncated")


@dataclass(frozen=True)
class BuildConfig:
    n: int
    seed: int
    frame_from: str
    frame_to: str
    start: str
    end: str
    out_dir: Path
    min_stars: int = 100
    max_stars: int = 2000
    frame_pages: int = 1
    max_pr_pages: int = 30

    def __post_init__(self) -> None:
        months_between(self.frame_from, self.frame_to)
        months_between(self.start, self.end)
        if self.n < 1:
            raise ValueError(f"n must be positive, got {self.n}")


@dataclass(frozen=True)
class BuildSummary:
    seed: int
    frame_size: int
    sampled: int
    missing: int
    in_panel: int
    adopters_in_window: int
    merged_prs: int
    truncated: int
    panel_rows: int


def _write_repos(records: list[RepoRecord], path: Path) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(REPOS_COLUMNS)
        for r in records:
            writer.writerow(
                [r.full_name, r.created_at, r.stars, r.status, r.adoption_at or "",
                 len(r.prs), int(r.truncated)]
            )  # fmt: skip


def build_actions_panel(
    client: GhClient, config: BuildConfig, progress: Callable[[str], None] = print
) -> BuildSummary:
    frame_months = months_between(config.frame_from, config.frame_to)
    frame = build_frame(
        client, frame_months, config.min_stars, config.max_stars, pages=config.frame_pages
    )
    sample = sample_repos(frame, config.n, config.seed)
    progress(f"frame {len(frame)} repositories, sampled {len(sample)} (seed {config.seed})")
    records = []
    for i, repo in enumerate(sample, start=1):
        records.append(fetch_repo(client, repo, config.start, config.max_pr_pages))
        if i % 25 == 0 or i == len(sample):
            progress(f"fetched {i}/{len(sample)} (gh calls {client.calls}, cache {client.hits})")
    rows = build_panel(records, config.start, config.end)
    in_panel = {row["repo"] for row in rows}
    out = Path(config.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    write_panel(rows, out / "panel.csv")
    _write_repos(records, out / "repos.csv")
    summary = BuildSummary(
        seed=config.seed,
        frame_size=len(frame),
        sampled=len(sample),
        missing=sum(r.status == "missing" for r in records),
        in_panel=len(in_panel),
        adopters_in_window=len(
            {row["repo"] for row in rows if row["adoption_month"] and row["treated"]}
        ),
        merged_prs=sum(row["n_merged"] for row in rows),
        truncated=sum(r.truncated for r in records if r.full_name in in_panel),
        panel_rows=len(rows),
    )
    meta = {
        **{k: v for k, v in asdict(config).items() if k != "out_dir"},
        "queries": [frame_query(m, config.min_stars, config.max_stars) for m in frame_months],
        **asdict(summary),
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return summary


_METRICS = (
    ("actions_panel_repos", "in_panel", "repos"),
    ("actions_panel_adopters", "adopters_in_window", "repos"),
    ("actions_panel_merged_prs", "merged_prs", "PRs"),
    ("actions_panel_truncated_repos", "truncated", "repos"),
    ("actions_panel_missing_repos", "missing", "repos"),
)


def summary_records(summary: BuildSummary, pr: str, git_sha: str, run_at: str) -> list[RunRecord]:
    notes = (
        f"GitHub Actions panel via gh api: frame={summary.frame_size} sampled={summary.sampled} "
        f"panel_rows={summary.panel_rows}; adopters = first .github/workflows commit inside "
        f"the window; merged PRs exclude bots"
    )
    return [
        RunRecord(
            run_at=run_at,
            git_sha=git_sha,
            pr=pr,
            metric_id="M7-data",
            metric=metric,
            value=float(getattr(summary, attr)),
            unit=unit,
            n=summary.sampled,
            seed=str(summary.seed),
            simulated=False,
            notes=notes,
        )
        for metric, attr, unit in _METRICS
    ]
