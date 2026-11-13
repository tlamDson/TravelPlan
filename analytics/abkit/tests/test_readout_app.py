"""The Streamlit readout app (``[app]`` extra). CI installs core + dev only, so it skips there."""

from pathlib import Path

import pytest
from conftest import GOLDEN_LATEST

pytest.importorskip("streamlit", reason="the [app] extra (streamlit) is not installed")
from streamlit.testing.v1 import AppTest  # noqa: E402

APP = Path(__file__).resolve().parents[1] / "src/abkit/readout/app.py"


def _app() -> AppTest:
    at = AppTest.from_file(str(APP), default_timeout=60)
    at.run()
    return at


def _markdown(at: AppTest) -> str:
    return "\n".join(m.value for m in at.markdown)


def test_app_lists_the_golden_readout_cases_and_renders_a_memo() -> None:
    at = _app()
    assert not at.exception
    case = at.sidebar.selectbox(key="case")
    assert "sim-srm/loss-15-aa" in case.options and len(case.options) == 50
    case.set_value("sim-effect/graded-by-persona").run()
    assert "## Decision: SHIP" in _markdown(at)
    assert not at.error


def test_app_shows_an_error_banner_when_srm_blocks_the_conclusion() -> None:
    at = _app()
    at.sidebar.selectbox(key="case").set_value("sim-srm/loss-15-aa").run()
    assert at.error and "blocked" in at.error[0].value.lower()
    assert "CONCLUSION BLOCKED" in _markdown(at)


def test_app_reads_a_csv_with_params(tmp_path: Path) -> None:
    import json

    case = GOLDEN_LATEST / "sim-ratio" / "aa-01"
    params = tmp_path / "params.json"
    params.write_text(json.dumps(json.loads((case / "truth.json").read_text())["params"]))
    at = _app()
    at.sidebar.radio(key="source").set_value("CSV + params").run()
    at.sidebar.text_input(key="csv").set_value(str(case / "data.csv"))
    at.sidebar.text_input(key="params").set_value(str(params))
    at.sidebar.radio(key="kind").set_value("Real users").run()
    assert not at.exception
    assert "# Readout: data" in _markdown(at)


def test_app_reports_bad_input_without_crashing(tmp_path: Path) -> None:
    at = _app()
    at.sidebar.radio(key="source").set_value("CSV + params").run()
    at.sidebar.text_input(key="csv").set_value(str(tmp_path / "missing.csv"))
    at.sidebar.text_input(key="params").set_value(str(tmp_path / "params.json")).run()
    assert not at.exception
    assert at.error and "missing.csv" in at.error[0].value
