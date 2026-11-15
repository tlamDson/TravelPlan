"""Resume bullets quote only runs.csv numbers (B2 plan, PR 24)."""

import csv
import re
from decimal import Decimal
from pathlib import Path

from abkit.runs import RUNS_CSV_PATH

BULLETS = Path(__file__).resolve().parents[2] / "runs/resume-bullets.md"
SOURCE_ROW = re.compile(r"^\| `(?P<metric>[a-z0-9_\-]+)`\s*\| (?P<value>-?[0-9.e+-]+)\s*\|", re.M)


def _last_values():
    with RUNS_CSV_PATH.open(newline="", encoding="utf-8") as fh:
        return {r["metric"]: float(r["value"]) for r in csv.DictReader(fh)}


def test_bullets_file_has_the_two_b2_bullets_and_marks_simulated_data():
    text = BULLETS.read_text(encoding="utf-8")
    bullets = [line for line in text.splitlines() if line.startswith("- ")]
    assert len(bullets) >= 2
    assert "simulated" in text.lower()
    assert "[__]" not in text


def test_every_source_value_is_the_runs_csv_value():
    text = BULLETS.read_text(encoding="utf-8")
    rows = SOURCE_ROW.findall(text)
    assert len(rows) >= 12
    actual = _last_values()
    for metric, value in rows:
        assert metric in actual, metric
        assert float(value) == float(f"{actual[metric]:.4g}"), metric


# A number in the prose is sourced when it is, within its own rounding, a source-table
# value (as is, absolute, or x100 for a share), its n, or a number from its notes column.
NUMBER = re.compile(r"(?<![A-Za-z0-9_.])-?\d[\d,]*(?:\.\d+)?(?:e-?\d+)?(?![A-Za-z_])")


def _source_candidates():
    text = BULLETS.read_text(encoding="utf-8")
    metrics = {m for m, _ in SOURCE_ROW.findall(text)}
    with RUNS_CSV_PATH.open(newline="", encoding="utf-8") as fh:
        rows = {r["metric"]: r for r in csv.DictReader(fh) if r["metric"] in metrics}
    found = set()
    for row in rows.values():
        numbers = [float(row["value"])]
        if row["n"]:
            numbers.append(float(row["n"]))
        numbers += [float(t.replace(",", "")) for t in NUMBER.findall(row["notes"])]
        for v in numbers:
            found |= {v, abs(v), v * 100, abs(v) * 100}
    return found


def unsourced_numbers(prose, candidates):
    bad = []
    for token in NUMBER.findall(prose):
        quantum = Decimal(token.replace(",", "")).as_tuple().exponent
        tolerance = 0.5 * 10.0**quantum + 1e-9
        if not any(abs(c - float(token.replace(",", ""))) <= tolerance for c in candidates):
            bad.append(token)
    return bad


def test_every_number_in_the_prose_comes_from_runs_csv():
    text = BULLETS.read_text(encoding="utf-8")
    prose = text.split("## Source")[0]
    assert len(NUMBER.findall(prose)) >= 15
    assert unsourced_numbers(prose, _source_candidates()) == []


def test_the_prose_check_rejects_an_invented_number():
    candidates = _source_candidates()
    assert unsourced_numbers("cut variance by 99.9% on 777 users", candidates) == ["99.9", "777"]
    assert unsourced_numbers("false positive rate of 21.6%", candidates) == []
