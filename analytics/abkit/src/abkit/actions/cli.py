"""``abkit actions-panel``: build the GitHub Actions merge-time panel (exit 2 on bad input).

GET-only ``gh api`` calls, cached under ``--cache`` (keep it outside git, e.g.
``D:/data/b2/gh-cache``); a rerun after an interruption reads the cache and resumes.
"""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

from abkit.actions.build import BuildConfig, build_actions_panel, summary_records
from abkit.actions.gh import GhClient, GhError
from abkit.bench import _git_sha
from abkit.runs import RUNS_CSV_PATH, append_run

ACTIONS_PANEL_DIR = Path(__file__).resolve().parents[4] / "data/actions_panel"


def _actions_panel(args: argparse.Namespace) -> int:
    try:
        config = BuildConfig(
            n=args.n,
            seed=args.seed,
            frame_from=args.frame_from,
            frame_to=args.frame_to,
            start=args.start,
            end=args.end,
            out_dir=args.out,
            min_stars=args.min_stars,
            max_stars=args.max_stars,
            frame_pages=args.frame_pages,
            max_pr_pages=args.max_pr_pages,
        )
        summary = build_actions_panel(GhClient(args.cache), config)
    except (ValueError, OSError, GhError) as err:
        print(f"abkit actions-panel: {err}", file=sys.stderr)
        return 2
    print(f"wrote {summary.panel_rows} panel rows ({summary.in_panel} repos) to {args.out}")
    if args.record:
        run_at = datetime.now(UTC).isoformat(timespec="seconds")
        for record in summary_records(summary, pr=args.pr, git_sha=_git_sha(), run_at=run_at):
            append_run(record, args.runs_csv)
            print(f"{record.metric}={record.value:g} {record.unit} (n={record.n})")
    return 0


def add_actions_panel(commands) -> None:
    panel = commands.add_parser(
        "actions-panel", help="repo x month PR merge-time panel around GitHub Actions adoption"
    )
    panel.add_argument("--cache", type=Path, required=True, help="gh api cache directory")
    panel.add_argument("--out", type=Path, default=ACTIONS_PANEL_DIR)
    panel.add_argument("--n", type=int, default=400, help="repositories to sample")
    panel.add_argument("--seed", type=int, default=18)
    panel.add_argument("--frame-from", default="2014-01", help="first creation month (frame)")
    panel.add_argument("--frame-to", default="2017-12", help="last creation month (frame)")
    panel.add_argument("--start", default="2018-01", help="first panel month")
    panel.add_argument("--end", default="2022-12", help="last panel month")
    panel.add_argument("--min-stars", type=int, default=100)
    panel.add_argument("--max-stars", type=int, default=2000)
    panel.add_argument("--frame-pages", type=int, default=1, help="search pages per month")
    panel.add_argument("--max-pr-pages", type=int, default=30, help="PR pages per repo")
    panel.add_argument("--record", action="store_true", help="append the summary to runs.csv")
    panel.add_argument("--pr", default="")
    panel.add_argument("--runs-csv", type=Path, default=RUNS_CSV_PATH)
    panel.set_defaults(handler=_actions_panel)
