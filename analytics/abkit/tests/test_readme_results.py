"""README results come from runs.csv only (B2 plan, PR 22)."""

import csv
import re
import subprocess
import sys
from pathlib import Path

import pytest

from abkit.readme_results import (
    RESULT_SPECS,
    ResultSpec,
    apply_block,
    main,
    render_results,
)
from abkit.runs import RUNS_CSV_PATH

ABKIT_DIR = Path(__file__).resolve().parents[1]
README = ABKIT_DIR / "README.md"
DOCS_RESULTS = ABKIT_DIR / "docs/results.md"


def row(metric, value, unit="share", simulated="false", notes="", n="100", metric_id="M1"):
    return {
        "metric_id": metric_id,
        "metric": metric,
        "value": str(value),
        "unit": unit,
        "n": n,
        "simulated": simulated,
        "notes": notes,
    }


ROWS = [
    row("real_a", 1.5, "pp", "false", "first", metric_id="M6"),
    row("real_a", 2.25, "pp", "false", "second", metric_id="M6"),
    row("sim_a", 0.2155, "proportion", "true", "virtual users; locust_vus=1000", n="10000"),
    row("sim_a", 0.5, "proportion", "true", "virtual users; locust_vus=50", n="10000"),
]
SPECS = (
    ResultSpec("Real A", "real_a", simulated=False),
    ResultSpec("Sim A", "sim_a", simulated=True, notes_contains="locust_vus=1000"),
)


def test_render_uses_the_last_matching_row_and_keeps_real_and_simulated_apart():
    text = render_results(ROWS, SPECS)
    real, simulated = text.split("Simulated")
    assert "Real A" in real and "2.25" in real and "1.5 " not in real
    assert "Sim A" in simulated and "0.2155" in simulated and "0.5 " not in simulated
    assert "virtual users" in simulated
    assert "recovered a known injected effect" in simulated
    assert "Sim A" not in real and "Real A" not in simulated


def test_render_rejects_a_spec_without_a_row():
    with pytest.raises(LookupError, match="nope"):
        render_results(ROWS, (ResultSpec("X", "nope", simulated=False),))


def test_render_rejects_a_spec_that_mislabels_simulated_data():
    with pytest.raises(ValueError, match="simulated"):
        render_results(ROWS, (ResultSpec("Sim A", "sim_a", simulated=False),))


def test_apply_block_replaces_only_between_markers():
    text = "head\n<!-- results:start -->\nold\n<!-- results:end -->\ntail\n"
    out = apply_block(text, "NEW")
    assert out == "head\n<!-- results:start -->\nNEW\n<!-- results:end -->\ntail\n"
    assert apply_block(out, "NEW") == out


def test_apply_block_needs_both_markers():
    with pytest.raises(ValueError, match="results:start"):
        apply_block("no markers", "x")


def test_main_check_fails_on_a_stale_file_and_write_fixes_it(tmp_path):
    runs = tmp_path / "runs.csv"
    with runs.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(ROWS[0]))
        writer.writeheader()
        writer.writerows(ROWS)
    doc = tmp_path / "doc.md"
    doc.write_text("<!-- results:start -->\nstale\n<!-- results:end -->\n", encoding="utf-8")
    args = ["--runs", str(runs), "--file", str(doc)]
    assert main([*args, "--check"], specs=SPECS) == 1
    assert main([*args, "--write"], specs=SPECS) == 0
    assert "Real A" in doc.read_text(encoding="utf-8")
    assert main([*args, "--check"], specs=SPECS) == 0


def _runs_rows():
    with RUNS_CSV_PATH.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


@pytest.mark.parametrize("path", [README, DOCS_RESULTS], ids=lambda p: p.name)
def test_committed_results_block_is_what_runs_csv_produces(path):
    block = render_results(_runs_rows(), RESULT_SPECS)
    text = path.read_text(encoding="utf-8")
    assert apply_block(text, block) == text, f"{path.name} is stale: abkit-results --write"


def test_every_spec_resolves_in_the_committed_runs_csv():
    assert len(RESULT_SPECS) >= 20
    render_results(_runs_rows(), RESULT_SPECS)


def test_readme_quickstart_runs():
    text = README.read_text(encoding="utf-8")
    blocks = re.findall(r"```python\n(.*?)```", text, flags=re.S)
    assert blocks, "README needs a python quickstart"
    code = "\n".join(blocks)
    result = subprocess.run(
        [sys.executable, "-I", "-c", code], capture_output=True, text=True, timeout=120
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip(), "the quickstart should print something"
