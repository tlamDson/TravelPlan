"""G-public LaLonde NSW: the experimental ATE is the benchmark for observational methods.

Every expected number comes from Dehejia & Wahba (1999) (NBER w6586, Tables 2-3), never from
abkit. The data checks below use NumPy only, so they hold whatever the engine does.
"""

import ast
import json
import math
import os
from pathlib import Path

import numpy as np
import pytest
from conftest import GOLDEN_LATEST

from abkit.golden.case import KNOWN_METHODS, load_case, load_dataset
from abkit.golden.freeze_lalonde import RAW_FILES, build_lalonde_cases, freeze_lalonde
from abkit.golden.methods import IMPLEMENTATIONS
from abkit.golden.runner import Status, run_golden

CAUSAL_METHODS = {"naive_diff", "ipw", "aipw"}
LALONDE = {
    "public/lalonde-experimental",
    "public/lalonde-psid-naive",
    "public/lalonde-psid-ipw",
    "public/lalonde-psid-aipw",
}
PUBLISHED_EXPERIMENTAL = 1794
PUBLISHED_EXPERIMENTAL_SE = 633
PUBLISHED_PSID_NAIVE = -15205
#: Half-width of the experimental 95% CI: an observational estimate inside it "recovers" the ATE.
EXPERIMENTAL_CI_HALF_WIDTH = 1.959963984540054 * PUBLISHED_EXPERIMENTAL_SE
LOCAL_RAW = Path(os.environ.get("ABKIT_LALONDE_DIR", "D:/data/b2/lalonde"))


def _case(case_id: str):
    return load_case(GOLDEN_LATEST / case_id)


def _treated_control(case_id: str) -> tuple[np.ndarray, np.ndarray]:
    data = _case(case_id).read_data()
    t = data["treatment"]
    return data["re78"][t == 1], data["re78"][t == 0]


def test_causal_methods_are_known_and_registered() -> None:
    assert CAUSAL_METHODS <= KNOWN_METHODS
    assert set(IMPLEMENTATIONS) >= CAUSAL_METHODS


def test_latest_dataset_holds_the_four_lalonde_cases() -> None:
    public = {c.id for c in load_dataset(GOLDEN_LATEST) if c.group == "public"}
    assert public >= LALONDE
    for case_id in LALONDE:
        source = _case(case_id).source
        assert source["tool"] == "published"
        assert "w6586" in source["paper_url"]
        assert source["data_url"].startswith("https://users.nber.org/~rdehejia/data/")


def test_experimental_data_reproduces_the_published_benchmark() -> None:
    y1, y0 = _treated_control("public/lalonde-experimental")
    assert (y1.size, y0.size) == (185, 260)
    assert round(y1.mean() - y0.mean()) == PUBLISHED_EXPERIMENTAL
    pooled = ((y1.size - 1) * y1.var(ddof=1) + (y0.size - 1) * y0.var(ddof=1)) / (
        y1.size + y0.size - 2
    )
    assert round(math.sqrt(pooled * (1 / y1.size + 1 / y0.size))) == PUBLISHED_EXPERIMENTAL_SE


def test_psid_data_reproduces_the_published_naive_difference() -> None:
    y1, y0 = _treated_control("public/lalonde-psid-naive")
    assert (y1.size, y0.size) == (185, 2490)
    assert round(y1.mean() - y0.mean()) == PUBLISHED_PSID_NAIVE


def test_psid_cases_share_one_data_file_content_and_the_experimental_treated_rows() -> None:
    texts = {
        (GOLDEN_LATEST / c / "data.csv").read_bytes().replace(b"\r\n", b"\n")
        for c in LALONDE - {"public/lalonde-experimental"}
    }
    assert len(texts) == 1
    exp_treated, _ = _treated_control("public/lalonde-experimental")
    psid_treated, _ = _treated_control("public/lalonde-psid-ipw")
    np.testing.assert_array_equal(exp_treated, psid_treated)


@pytest.mark.parametrize("case_id", ["public/lalonde-psid-ipw", "public/lalonde-psid-aipw"])
def test_observational_cases_target_the_experimental_ci(case_id: str) -> None:
    case = _case(case_id)
    assert case.params["estimand"] == "att"
    assert case.expected == {"estimate": PUBLISHED_EXPERIMENTAL}
    tol = case.tolerance_for("estimate")
    assert tol.abs == pytest.approx(EXPERIMENTAL_CI_HALF_WIDTH, abs=0.01)
    assert tol.rel == 0
    assert case.decision is None


def test_every_lalonde_case_passes_and_naive_would_not_recover_the_benchmark() -> None:
    report = run_golden(GOLDEN_LATEST)
    results = {r.case_id: r for r in report.results if r.case_id in LALONDE}
    assert {k: r.status for k, r in results.items()} == dict.fromkeys(LALONDE, Status.PASS)
    naive = IMPLEMENTATIONS["naive_diff"](
        _case("public/lalonde-psid-naive").read_data(), {"outcome": "re78", "alpha": 0.05}
    )
    assert abs(naive["estimate"] - PUBLISHED_EXPERIMENTAL) > 10 * EXPERIMENTAL_CI_HALF_WIDTH


def test_ipw_adapter_reads_terms_and_estimand_from_params() -> None:
    data = {
        "treatment": np.array([1, 1, 0, 0, 0, 1, 1, 1, 0, 0], dtype=float),
        "y": np.array([4, 6, 1, 2, 3, 10, 12, 14, 7, 9], dtype=float),
        "x": np.array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1], dtype=float),
    }
    params = {"outcome": "y", "propensity_terms": ["x"], "estimand": "att", "alpha": 0.05}
    assert IMPLEMENTATIONS["ipw"](data, params)["estimate"] == pytest.approx(3.6, rel=1e-9)
    params["outcome_terms"] = ["x"]
    assert IMPLEMENTATIONS["aipw"](data, params)["estimate"] == pytest.approx(3.6, rel=1e-9)


def _fake_raw(raw_dir: Path) -> None:
    rows = {
        "nswre74_treated.txt": ["1 37 11 1 0 1 1 0 0 9930.046", "1 22 9 0 1 0 1 0 0 3595.894"],
        "nswre74_control.txt": ["0 23 10 1 0 0 1 0 0 0", "0 26 12 0 0 0 0 0 0 12383.68"],
        "psid_controls.txt": ["0 30 12 0 0 1 0 2.0e+04 1.8e+04 2.1e+04"],
    }
    raw_dir.mkdir()
    for name, lines in rows.items():
        (raw_dir / name).write_text("\n".join(f"  {line}" for line in lines) + "\n")


def test_build_derives_unemployment_dummies_and_checks_hashes(tmp_path: Path) -> None:
    _fake_raw(tmp_path / "raw")
    with pytest.raises(ValueError, match="sha256"):
        build_lalonde_cases(tmp_path / "raw")
    cases = build_lalonde_cases(tmp_path / "raw", check_hashes=False)
    assert {c.case_id for c in cases} == LALONDE
    experimental = next(c for c in cases if c.case_id == "public/lalonde-experimental")
    lines = experimental.csv_text.splitlines()
    assert lines[0] == "treatment,age,educ,black,hisp,married,nodegree,re74,re75,re78,u74,u75"
    assert lines[1] == "1,37,11,1,0,1,1,0,0,9930.046,1,1"
    assert len(lines) == 5


def test_freeze_writes_loadable_cases_and_refuses_to_overwrite(tmp_path: Path) -> None:
    _fake_raw(tmp_path / "raw")
    written = freeze_lalonde(tmp_path / "out", tmp_path / "raw", check_hashes=False)
    assert len(written) == 4
    assert {c.id for c in load_dataset(tmp_path / "out")} == LALONDE
    truth = json.loads((written[0] / "truth.json").read_text(encoding="utf-8"))
    assert truth["source"]["generator"] == "abkit.golden.freeze_lalonde"
    with pytest.raises(FileExistsError):
        freeze_lalonde(tmp_path / "out", tmp_path / "raw", check_hashes=False)


@pytest.mark.skipif(not LOCAL_RAW.is_dir(), reason="raw DW files live outside the repo")
def test_committed_cases_match_the_raw_dehejia_wahba_files() -> None:
    assert all((LOCAL_RAW / name).is_file() for name in RAW_FILES)
    for built in build_lalonde_cases(LOCAL_RAW):
        committed = (GOLDEN_LATEST / built.case_id / "data.csv").read_bytes()
        assert committed.replace(b"\r\n", b"\n").decode("utf-8") == built.csv_text
        on_disk = json.loads((GOLDEN_LATEST / built.case_id / "truth.json").read_text("utf-8"))
        assert {k: v for k, v in on_disk.items() if k != "source"} == {
            k: v for k, v in built.truth.items() if k != "source"
        }


def test_lalonde_freezer_never_imports_the_abkit_engine() -> None:
    path = Path(__file__).resolve().parents[1] / "src/abkit/golden/freeze_lalonde.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
        elif isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
    assert {m for m in imported if m.startswith("abkit")} <= {"abkit.golden.case"}
