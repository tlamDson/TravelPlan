"""M9: backtest DAU and contributor forecasts on an event log, append the scores to runs.csv.

    python -m abkit.forecast EVENTS (--simulated | --real) [--pr 21] [--seed 42]
        [--horizon 7] [--initial 28] [--step 7] [--level 0.95]
        [--models seasonal_naive,ets,arima] [--runs-csv PATH] [--dry-run]

EVENTS is a ``.jsonl``/``.jsonl.gz`` file or a directory of daily exports. Whether the users are
simulated must be stated, never guessed; ``--real`` is refused when any id carries simkit's
``sim-`` prefix. Exit codes: 0 ok, 2 usage or data error.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from abkit.bench import _git_sha
from abkit.forecast.backtest import BacktestResult, rolling_origin
from abkit.forecast.models import MODELS, ForecastError
from abkit.forecast.series import DailySeries, daily_active_users, daily_contributors, read_events
from abkit.runs import RUNS_CSV_PATH, RunRecord, append_run

SIM_PREFIX = "sim-"


def _models(text: str) -> list[str]:
    names = [n.strip() for n in text.split(",") if n.strip()]
    unknown = sorted(set(names) - set(MODELS))
    if not names or unknown:
        raise argparse.ArgumentTypeError(f"unknown model(s) {unknown}; known: {sorted(MODELS)}")
    return names


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="abkit.forecast", description=__doc__.splitlines()[0])
    parser.add_argument("events", type=Path)
    kind = parser.add_mutually_exclusive_group(required=True)
    kind.add_argument("--simulated", action="store_true", help="events of simulated users")
    kind.add_argument("--real", action="store_true", help="events of real users")
    parser.add_argument("--pr", default="")
    parser.add_argument("--seed", default="", help="simkit seed of the events, if any")
    parser.add_argument("--horizon", type=int, default=7)
    parser.add_argument("--initial", type=int, default=28)
    parser.add_argument("--step", type=int, default=7)
    parser.add_argument("--level", type=float, default=0.95)
    parser.add_argument("--models", type=_models, default=list(MODELS))
    parser.add_argument("--runs-csv", type=Path, default=RUNS_CSV_PATH)
    parser.add_argument("--dry-run", action="store_true", help="print the rows, do not append")
    return parser


def _records(
    series: DailySeries, result: BacktestResult, args: argparse.Namespace, sha: str
) -> list[RunRecord]:
    score = result.score()
    spec, count = Counter(result.specs).most_common(1)[0]
    notes = (
        f"series={series.name} model={result.model} horizon={result.horizon} "
        f"initial={args.initial} step={args.step} origins={score.n_origins} "
        f"level={result.level} days={len(series.values)} start={series.start.isoformat()} "
        f"zero_excluded={score.n_zero_excluded} mean_width={score.mean_width:.3f} "
        f"source={args.events.name} spec={spec} ({count}/{score.n_origins} origins)"
    )
    common = {
        "run_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "git_sha": sha,
        "pr": args.pr,
        "metric_id": "M9",
        "seed": args.seed,
        "simulated": args.simulated,
        "notes": notes,
    }
    pct = round(result.level * 100)
    suffix = f"{series.name}_{result.model}"
    return [
        RunRecord(
            metric=f"forecast_mape_{suffix}",
            value=round(score.mape, 4),
            unit="%",
            n=score.n_points - score.n_zero_excluded,
            **common,
        ),
        RunRecord(
            metric=f"forecast_pi{pct}_coverage_{suffix}",
            value=round(score.coverage, 4),
            unit="share",
            n=score.n_points,
            **common,
        ),
    ]


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        events = read_events(args.events)
        if args.real and any(str(e.get("userId") or "").startswith(SIM_PREFIX) for e in events):
            raise ValueError(f"--real given but some userIds start with {SIM_PREFIX!r}")
        all_series = [daily_active_users(events), daily_contributors(events)]
        sha = _git_sha()
        records: list[RunRecord] = []
        for series in all_series:
            for name in args.models:
                result = rolling_origin(
                    series.values,
                    MODELS[name](),
                    horizon=args.horizon,
                    initial=args.initial,
                    step=args.step,
                    level=args.level,
                )
                records.extend(_records(series, result, args, sha))
    except (OSError, ValueError, ForecastError) as err:
        print(f"abkit.forecast: {err}", file=sys.stderr)
        return 2
    for record in records:
        if not args.dry_run:
            append_run(record, args.runs_csv)
        print(f"{record.metric}={record.value} {record.unit} (n={record.n})")
    return 0
