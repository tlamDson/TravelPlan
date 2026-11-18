"""The root README quotes only runs.csv numbers in its results table and charts."""

import csv
import re
from decimal import Decimal
from pathlib import Path

import pytest

from abkit.runs import RUNS_CSV_PATH

README = Path(__file__).resolve().parents[3] / "README.md"

# A number, optionally with a "k" (thousands) suffix; "log1p" or "A/A" hold no number.
NUMBER = re.compile(r"(?<![A-Za-z0-9_.])-?\d[\d,]*(?:\.\d+)?k?(?![A-Za-z0-9_])")
METRIC = re.compile(r"`([a-z0-9_\-]+)`")
MERMAID = re.compile(r"```mermaid\n(.*?)```", re.S)
Y_RANGE = re.compile(r"-?\d+(?:\.\d+)?\s*-->\s*-?\d+(?:\.\d+)?")
PERCENT_UNITS = {"proportion", "share", "fraction"}


def _runs():
    with RUNS_CSV_PATH.open(newline="", encoding="utf-8") as fh:
        return {r["metric"]: r for r in csv.DictReader(fh)}  # last row of each metric wins


def _parse(token):
    text = token.replace(",", "")
    scale = 1000.0 if text.endswith("k") else 1.0
    text = text.rstrip("k")
    return float(text) * scale, Decimal(text).as_tuple().exponent


def _candidates(rows):
    found = set()
    for row in rows:
        numbers = [float(row["value"])]
        if row["n"]:
            numbers.append(float(row["n"]))
        for field in ("notes", "unit"):
            numbers += [_parse(t)[0] for t in NUMBER.findall(row[field])]
        for v in numbers:
            found |= {v, abs(v), v * 100, abs(v) * 100}
    return found


def unsourced_numbers(text, candidates):
    bad = []
    for token in NUMBER.findall(text):
        value, quantum = _parse(token)
        tolerance = 0.5 * 10.0**quantum + 1e-9
        if not any(abs(c - value) <= tolerance for c in candidates):
            bad.append(token)
    return bad


def _section(text, heading):
    start = text.index(heading)
    end = text.find("\n## ", start + len(heading))
    return text[start : end if end != -1 else len(text)]


def _table_rows(section):
    return [
        line
        for line in section.splitlines()
        if line.startswith("|") and not set(line) <= set("|-: ")
    ][1:]  # drop the header row


def _results_rows():
    text = README.read_text(encoding="utf-8")
    return _table_rows(_section(text, "## Results in numbers"))


def _charts():
    text = README.read_text(encoding="utf-8")
    return [b for b in MERMAID.findall(text) if b.lstrip().startswith("xychart-beta")]


def test_readme_opens_with_badges_demo_and_an_architecture_flowchart():
    text = README.read_text(encoding="utf-8")
    head = text.split("\n## ")[0]
    assert "https://plancare-web-omega.vercel.app" in head
    assert head.count("![") >= 2  # CI and license badges
    first_block = MERMAID.search(text).group(1)
    assert first_block.lstrip().startswith("flowchart")
    for part in ("DRAFT", "QUEUED", "PROCESSING", "COMPLETED", "FAILED", "BullMQ", "abkit"):
        assert part in first_block, part
    for part in ("Gemini", "Mapbox", "Google Places", "Clerk", "MongoDB", "Vercel"):
        assert part in first_block, part


def test_every_results_row_cites_runs_csv_and_quotes_only_its_numbers():
    runs = _runs()
    rows = _results_rows()
    assert len(rows) >= 5
    for row in rows:
        metrics = METRIC.findall(row)
        assert metrics, row
        assert all(m in runs for m in metrics), row
        quoted = row.split("`")[0]  # the cells before the source column
        assert NUMBER.findall(quoted), row
        assert unsourced_numbers(quoted, _candidates(runs[m] for m in metrics)) == [], row
        if any(runs[m]["simulated"] == "true" for m in metrics):
            assert "simulated" in quoted.lower(), row


def test_results_section_has_no_number_outside_the_checked_table_and_charts():
    text = README.read_text(encoding="utf-8")
    results = MERMAID.sub("", _section(text, "## Results in numbers"))
    prose = "\n".join(line for line in results.splitlines() if not line.startswith("|"))
    assert NUMBER.findall(prose) == []


def test_three_charts_plot_runs_csv_values():
    runs = _runs()
    charts = _charts()
    assert len(charts) == 3
    for chart in charts:
        source = re.search(r"^\s*%% source: (.+)$", chart, re.M)
        assert source, chart
        metrics = [m.strip() for m in source.group(1).split(",")]
        assert all(m in runs for m in metrics), metrics
        bars = re.search(r"^\s*bar \[(.+)\]$", chart, re.M).group(1).split(",")
        assert len(bars) == len(metrics)
        for token, metric in zip(bars, metrics, strict=True):
            row = runs[metric]
            expected = float(row["value"]) * (100 if row["unit"] in PERCENT_UNITS else 1)
            value, quantum = _parse(token.strip())
            assert abs(value - expected) <= 0.5 * 10.0**quantum + 1e-9, (metric, token)
        labels = [
            Y_RANGE.sub("", line)
            for line in chart.splitlines()
            if not re.match(r"\s*(bar \[|%%)", line)
        ]
        candidates = _candidates(runs[m] for m in metrics)
        assert unsourced_numbers("\n".join(labels), candidates) == [], chart
        if any(runs[m]["simulated"] == "true" for m in metrics):
            assert "simulated" in chart.lower(), chart


def test_the_check_rejects_an_invented_number():
    candidates = _candidates([_runs()["fpr_msprt_daily_peek"]])
    assert unsourced_numbers("0.17% on 777 users, 0.5%", candidates) == ["777", "0.5"]


@pytest.mark.parametrize(
    "token,value", [("100k", 100000.0), ("10,000", 10000.0), ("-0.015", -0.015)]
)
def test_numbers_parse_with_suffix_and_separators(token, value):
    assert NUMBER.findall(f"x {token} y") == [token]
    assert _parse(token)[0] == value
