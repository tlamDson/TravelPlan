"""The root README quotes only runs.csv numbers in its results table and has no Mermaid."""

import csv
import re
from decimal import Decimal
from pathlib import Path

import pytest

from abkit.runs import RUNS_CSV_PATH

ROOT = Path(__file__).resolve().parents[3]
README = ROOT / "README.md"
ARCHITECTURE_SVG = ROOT / ".github" / "readme" / "architecture.svg"
RESULTS_HEADING = "## Results at a glance"
RESULTS_HEADER = ["What was tested", "Result", "Why it matters"]

# A number, optionally with a "k" (thousands) suffix; "log1p" or "A/A" hold no number.
NUMBER = re.compile(r"(?<![A-Za-z0-9_.])-?\d[\d,]*(?:\.\d+)?k?(?![A-Za-z0-9_])")
# Each results row names its runs.csv metrics in an HTML comment GitHub does not render.
SOURCE = re.compile(r"<!--\s*source:\s*([a-z0-9_,\s\-]+?)\s*-->")
IMAGE = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)\)")
SVG_TEXT = re.compile(r"<text\b[^>]*>(.*?)</text>", re.S)
SVG_LABELS = (
    "Traveler",
    "React web app",
    "Vercel",
    "Express API",
    "Redis",
    "BullMQ",
    "MongoDB",
    "PlaceCache",
    "Clerk",
    "Gemini",
    "Google Places",
    "Mapbox",
    "DRAFT",
    "QUEUED",
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    "abkit",
    "runs.csv",
    "CI gates",
)


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


def _table_lines(section):
    return [
        line
        for line in section.splitlines()
        if line.startswith("|") and not set(line) <= set("|-: ")
    ]


def _cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def _results_section():
    return _section(README.read_text(encoding="utf-8"), RESULTS_HEADING)


def test_readme_has_no_mermaid_block():
    text = README.read_text(encoding="utf-8")
    assert "```mermaid" not in text
    assert "xychart" not in text


def test_readme_shows_the_architecture_svg_right_under_the_pitch():
    text = README.read_text(encoding="utf-8")
    head = text.split("\n## ")[0]
    assert "https://plancare-web-omega.vercel.app" in head
    images = IMAGE.findall(head)
    assert len(images) >= 3  # CI and license badges, then the diagram
    alt, src = images[-1]
    assert src == ".github/readme/architecture.svg"
    assert len(alt.split()) >= 5, alt  # a real description, not "diagram"
    assert head.rstrip().endswith(f"![{alt}]({src})")  # last thing before "What it does"


def test_architecture_svg_holds_the_whole_system_in_plain_text_labels():
    svg = ARCHITECTURE_SVG.read_text(encoding="utf-8")
    width = re.search(r'<svg\b[^>]*\bwidth="(\d+(?:\.\d+)?)"', svg)
    assert width and float(width.group(1)) <= 900
    assert re.search(r'<svg\b[^>]*\bviewBox="0 0 \d+ \d+"', svg)
    labels = " ".join(re.sub(r"<[^>]+>", "", t) for t in SVG_TEXT.findall(svg))
    for part in SVG_LABELS:
        assert part in labels, part


def test_architecture_svg_reads_on_light_and_dark_themes_without_external_assets():
    svg = ARCHITECTURE_SVG.read_text(encoding="utf-8")
    first_shape = re.search(r"<(rect|path|circle|ellipse|line|polygon|text)\b[^>]*>", svg)
    background = first_shape.group(0)
    assert background.startswith("<rect"), background  # drawn first, under everything
    assert re.search(r'\bfill="(#fff|#ffffff|white)"', background, re.I), background
    assert re.search(r'\brx="\d+', background), background
    lowered = svg.lower().replace('xmlns="http://www.w3.org/2000/svg"', "")
    for banned in ("<script", "<foreignobject", "<image", "@import", "@font-face", "http"):
        assert banned not in lowered, banned


def test_results_table_has_the_three_plain_columns():
    header = _table_lines(_results_section())[0]
    assert _cells(header) == RESULTS_HEADER


def test_every_results_row_cites_runs_csv_and_quotes_only_its_numbers():
    runs = _runs()
    rows = _table_lines(_results_section())[1:]
    assert len(rows) >= 5
    for row in rows:
        assert len(_cells(row)) == len(RESULTS_HEADER), row
        source = SOURCE.search(row)
        assert source, row
        metrics = [m.strip() for m in source.group(1).split(",")]
        assert all(m in runs for m in metrics), row
        quoted = SOURCE.sub("", row)
        assert NUMBER.findall(quoted), row
        assert unsourced_numbers(quoted, _candidates(runs[m] for m in metrics)) == [], row
        if any(runs[m]["simulated"] == "true" for m in metrics):
            assert "simulated" in quoted.lower(), row


def test_results_section_has_no_number_outside_the_checked_table():
    prose = "\n".join(line for line in _results_section().splitlines() if not line.startswith("|"))
    assert NUMBER.findall(prose) == []


def test_the_check_rejects_an_invented_number():
    candidates = _candidates([_runs()["fpr_msprt_daily_peek"]])
    assert unsourced_numbers("0.17% on 777 users, 0.5%", candidates) == ["777", "0.5"]


@pytest.mark.parametrize(
    "token,value", [("100k", 100000.0), ("10,000", 10000.0), ("-0.015", -0.015)]
)
def test_numbers_parse_with_suffix_and_separators(token, value):
    assert NUMBER.findall(f"x {token} y") == [token]
    assert _parse(token)[0] == value
