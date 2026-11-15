"""Render the README / docs results tables from ``analytics/runs/runs.csv``.

    python -m abkit.readme_results --check    # exit 1 when a file is stale
    python -m abkit.readme_results --write    # rewrite the block between the markers

Every number in the block is one ``runs.csv`` row picked by ``metric`` (the last
matching row wins, so a rerun replaces an older number). Real and simulated rows
are kept in two tables; a spec that disagrees with the row's ``simulated`` flag
is an error, so simulated numbers cannot be shown as real ones.
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from abkit.runs import RUNS_CSV_PATH

START_MARKER = "<!-- results:start -->"
END_MARKER = "<!-- results:end -->"
_ABKIT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_FILES = (_ABKIT_DIR / "README.md", _ABKIT_DIR / "docs/results.md")


@dataclass(frozen=True)
class ResultSpec:
    label: str
    metric: str
    simulated: bool
    #: Pick among rows that share a metric name (e.g. two driver runs).
    notes_contains: str = ""


RESULT_SPECS: tuple[ResultSpec, ...] = (
    # Real data.
    ResultSpec(
        "M4: CUPED variance reduction, Hillstrom visit",
        "hillstrom_visit_cuped_variance_reduction",
        False,
    ),
    ResultSpec(
        "M4: CUPED variance reduction, Hillstrom spend",
        "hillstrom_spend_cuped_variance_reduction",
        False,
    ),
    ResultSpec(
        "M4: CUPED sample-size multiplier, Hillstrom visit",
        "hillstrom_visit_cuped_sample_size_multiplier",
        False,
    ),
    ResultSpec(
        "M4: CUPED sample-size multiplier, Hillstrom spend",
        "hillstrom_spend_cuped_sample_size_multiplier",
        False,
    ),
    ResultSpec(
        "M6: Hillstrom ATE bias, naive difference (biased resamples)",
        "hillstrom_ate_bias_naive_diff",
        False,
    ),
    ResultSpec("M6: Hillstrom ATE bias, IPW", "hillstrom_ate_bias_ipw", False),
    ResultSpec("M6: Hillstrom ATE bias, AIPW", "hillstrom_ate_bias_aipw", False),
    ResultSpec(
        "M6: LaLonde NSW+PSID ATT error, naive difference",
        "lalonde_psid_att_error_naive_diff",
        False,
    ),
    ResultSpec("M6: LaLonde NSW+PSID ATT error, IPW", "lalonde_psid_att_error_ipw", False),
    ResultSpec("M6: LaLonde NSW+PSID ATT error, AIPW", "lalonde_psid_att_error_aipw", False),
    ResultSpec("M7: DiD ATT, GitHub Actions on PR merge time (log1p hours)", "did_att_main", False),
    ResultSpec("M7: DiD ATT 95% CI low (log1p hours)", "did_att_ci95_low_main", False),
    ResultSpec("M7: DiD ATT 95% CI high (log1p hours)", "did_att_ci95_high_main", False),
    ResultSpec("M7: DiD ATT as a change in merge time", "did_att_pct_main", False),
    ResultSpec("M7: pre-trend test p-value", "did_pretrend_p_main", False),
    ResultSpec(
        "M8: Criteo LP gain over top-k, T-learner, 10% budget", "m8_lp_gain_over_topk_t_b10", False
    ),
    ResultSpec(
        "M8: Criteo LP gain over top-k, T-learner, 20% budget", "m8_lp_gain_over_topk_t_b20", False
    ),
    ResultSpec(
        "M8: Criteo LP gain over top-k, T-learner, 30% budget", "m8_lp_gain_over_topk_t_b30", False
    ),
    ResultSpec(
        "M8: Criteo LP gain over top-k, X-learner, 10% budget", "m8_lp_gain_over_topk_x_b10", False
    ),
    ResultSpec(
        "M8: Criteo LP gain over top-k, X-learner, 20% budget", "m8_lp_gain_over_topk_x_b20", False
    ),
    ResultSpec(
        "M8: Criteo LP gain over top-k, X-learner, 30% budget", "m8_lp_gain_over_topk_x_b30", False
    ),
    ResultSpec(
        "M10: planted mutants blocked by the golden gate (of 10)",
        "golden_gate_mutants_blocked",
        False,
    ),
    ResultSpec("M10: golden cases passing (G-ref + G-public)", "golden_pass_share", False),
    ResultSpec("G-B2-1 data: sampled repos with a usable panel", "actions_panel_repos", False),
    ResultSpec("G-B2-1 data: repos that adopted GitHub Actions", "actions_panel_adopters", False),
    ResultSpec("Assignment throughput", "assignment_throughput", False),
    # Simulated (virtual users).
    ResultSpec(
        "M1: false positive rate, t-test read once at the end", "fpr_ttest_fixed_horizon", True
    ),
    ResultSpec("M1: false positive rate, t-test read every day", "fpr_ttest_daily_peek", True),
    ResultSpec("M1: false positive rate, mSPRT read every day", "fpr_msprt_daily_peek", True),
    ResultSpec(
        "M3: 95% interval coverage, Welch read once", "ci95_coverage_welch_fixed_horizon", True
    ),
    ResultSpec(
        "M3: 95% interval coverage, Welch at every peek", "ci95_coverage_welch_all_peeks", True
    ),
    ResultSpec(
        "M3: 95% sequence coverage, mSPRT at every peek", "cs95_coverage_msprt_all_peeks", True
    ),
    ResultSpec("M2: power at 50,000 users per experiment, Welch", "power_welch_n50000", True),
    ResultSpec("M2: power at 50,000 users per experiment, analytic", "power_analytic_n50000", True),
    ResultSpec("M5: ATE bias at 50,000 users (injected effect known)", "bias_ate_pp_n50000", True),
    ResultSpec("M5: ATE 95% interval coverage at 50,000 users", "ci95_coverage_ate_n50000", True),
    ResultSpec("M9: DAU forecast MAPE, seasonal naive", "forecast_mape_dau_seasonal_naive", True),
    ResultSpec("M9: DAU forecast MAPE, ETS", "forecast_mape_dau_ets", True),
    ResultSpec("M9: DAU forecast MAPE, ARIMA", "forecast_mape_dau_arima", True),
    ResultSpec(
        "M9: DAU 95% forecast interval coverage, seasonal naive",
        "forecast_pi95_coverage_dau_seasonal_naive",
        True,
    ),
    ResultSpec(
        "M9: DAU 95% forecast interval coverage, ETS", "forecast_pi95_coverage_dau_ets", True
    ),
    ResultSpec(
        "M9: DAU 95% forecast interval coverage, ARIMA", "forecast_pi95_coverage_dau_arima", True
    ),
    ResultSpec(
        "M9a: events failing the schema (1,000 driver VUs)",
        "sim_driver_schema_invalid_share",
        True,
        "locust_vus=1000",
    ),
    ResultSpec(
        "M9a: duplicate events (1,000 driver VUs)",
        "sim_driver_duplicate_share",
        True,
        "locust_vus=1000",
    ),
    ResultSpec(
        "Ingest throughput (1,000 driver VUs)",
        "sim_driver_ingest_throughput",
        True,
        "locust_vus=1000",
    ),
    ResultSpec("M11: Cohen's kappa, memo vs labels", "decision_kappa_memo", True),
    ResultSpec(
        "M11: Cohen's kappa, p < 0.05 baseline vs labels", "decision_kappa_p05_baseline", True
    ),
)


def _find(rows: Sequence[Mapping[str, str]], spec: ResultSpec) -> Mapping[str, str]:
    matches = [
        r for r in rows if r["metric"] == spec.metric and spec.notes_contains in r.get("notes", "")
    ]
    if not matches:
        raise LookupError(f"no runs.csv row for metric {spec.metric!r} ({spec.notes_contains!r})")
    found = matches[-1]
    if (found["simulated"].strip().lower() == "true") != spec.simulated:
        raise ValueError(f"{spec.metric}: spec says simulated={spec.simulated}, runs.csv disagrees")
    return found


def _table(rows: Sequence[Mapping[str, str]], specs: Sequence[ResultSpec]) -> list[str]:
    lines = ["| Result | Value | n |", "| --- | --- | --- |"]
    for spec in specs:
        found = _find(rows, spec)
        n = int(float(found["n"])) if found.get("n") else 0
        value = f"{float(found['value']):.4g} {found['unit']}"
        lines.append(
            f"| {spec.label} | {value} | {n:,} |" if n else f"| {spec.label} | {value} | - |"
        )
    return lines


def render_results(
    rows: Sequence[Mapping[str, str]], specs: Sequence[ResultSpec] = RESULT_SPECS
) -> str:
    real = [s for s in specs if not s.simulated]
    simulated = [s for s in specs if s.simulated]
    out = ["**Real data**", "", *_table(rows, real), ""]
    out += [
        "**Simulated (virtual users)**",
        "",
        "These rows come from virtual users, counted apart from real users. Each reports "
        "whether abkit recovered a known injected effect, not an effect on real people.",
        "",
        *_table(rows, simulated),
    ]
    return "\n".join(out)


def apply_block(text: str, block: str) -> str:
    start, end = text.find(START_MARKER), text.find(END_MARKER)
    if start < 0 or end < start:
        raise ValueError(f"file needs {START_MARKER} and {END_MARKER} markers")
    head = text[: start + len(START_MARKER)]
    return f"{head}\n{block}\n{text[end:]}"


def main(argv: Sequence[str] | None = None, specs: Sequence[ResultSpec] = RESULT_SPECS) -> int:
    parser = argparse.ArgumentParser(prog="abkit-results", description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="exit 1 when a file is stale")
    mode.add_argument("--write", action="store_true", help="rewrite the results block")
    parser.add_argument("--runs", type=Path, default=RUNS_CSV_PATH)
    parser.add_argument("--file", type=Path, action="append", dest="files")
    args = parser.parse_args(argv)
    with args.runs.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    block = render_results(rows, specs)
    stale = 0
    for path in args.files or DEFAULT_FILES:
        text = path.read_text(encoding="utf-8")
        new = apply_block(text, block)
        if new == text:
            continue
        if args.write:
            path.write_text(new, encoding="utf-8", newline="\n")
            print(f"updated {path}")
        else:
            print(f"stale: {path}", file=sys.stderr)
            stale = 1
    return stale


if __name__ == "__main__":
    raise SystemExit(main())
