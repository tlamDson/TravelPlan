^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|"""Resume bullets quote only runs.csv numbers (B2 plan, PR 24)."""
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|import csv
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|import re
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|from pathlib import Path
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|from abkit.runs import RUNS_CSV_PATH
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|BULLETS = Path(__file__).resolve().parents[2] / "runs/resume-bullets.md"
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|SOURCE_ROW = re.compile(r"^\| `(?P<metric>[a-z0-9_\-]+)` \| (?P<value>-?[0-9.e+-]+) \|", re.M)
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|def _last_values():
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|    with RUNS_CSV_PATH.open(newline="", encoding="utf-8") as fh:
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|        return {r["metric"]: float(r["value"]) for r in csv.DictReader(fh)}
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|def test_bullets_file_has_the_two_b2_bullets_and_marks_simulated_data():
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|    text = BULLETS.read_text(encoding="utf-8")
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|    bullets = [line for line in text.splitlines() if line.startswith("- ")]
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|    assert len(bullets) >= 2
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|    assert "simulated" in text.lower()
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|    assert "[__]" not in text
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|def test_every_source_value_is_the_runs_csv_value():
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|    text = BULLETS.read_text(encoding="utf-8")
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|    rows = SOURCE_ROW.findall(text)
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|    assert len(rows) >= 12
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|    actual = _last_values()
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|    for metric, value in rows:
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|        assert metric in actual, metric
^| `(?P<metric>[a-z0-9_-]+)`s*| (?P<value>-?[0-9.e+-]+)s*|        assert float(value) == float(f"{actual[metric]:.4g}"), metric
