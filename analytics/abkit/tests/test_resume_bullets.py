"""Resume bullets quote only runs.csv numbers (B2 plan, PR 24)."""

import csv
import re
from pathlib import Path

from abkit.runs import RUNS_CSV_PATH

BULLETS = Path(__file__).resolve().parents[2] / "runs/resume-bullets.md"
SOURCE_ROW = re.compile(r"^\| `(?P<metric>[a-z0-9_\-]+)` \| (?P<value>-?[0-9.e+-]+) \|", re.M)


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
