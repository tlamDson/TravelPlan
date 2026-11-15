import json
from pathlib import Path

import numpy as np
import pytest
from conftest import BASE_TRUTH, write_case

from abkit.golden.case import (
    SCHEMA_VERSION,
    GoldenFormatError,
    Tolerance,
    load_case,
    load_dataset,
    read_csv_columns,
)


def test_load_case_parses_every_field(tmp_path: Path) -> None:
    case = load_case(write_case(tmp_path))
    assert SCHEMA_VERSION == 1
    assert case.id == "welch/tiny"
    assert (case.group, case.name) == ("welch", "tiny")
    assert case.method == "welch_ttest"
    assert case.params == {"alpha": 0.05, "alternative": "two-sided"}
    assert case.expected == {"estimate": 1.0, "p_value": 0.25}
    assert case.decision == "fail_to_reject"
    assert case.source["tool"] == "scipy"
    assert case.tolerance_for("estimate") == Tolerance(abs=1e-9, rel=1e-9)


def test_per_key_tolerance_overrides_the_default(tmp_path: Path) -> None:
    tolerance = {"default": {"abs": 0, "rel": 1e-9}, "p_value": {"abs": 1e-6, "rel": 0}}
    case = load_case(write_case(tmp_path, tolerance=tolerance))
    assert case.tolerance_for("p_value") == Tolerance(abs=1e-6, rel=0)
    assert case.tolerance_for("estimate") == Tolerance(abs=0, rel=1e-9)


def test_tolerance_allows_abs_plus_rel_band() -> None:
    tol = Tolerance(abs=0.01, rel=0.1)
    assert tol.allows(10.0, 11.01)
    assert not tol.allows(10.0, 11.02)
    assert Tolerance(abs=0, rel=0).allows(3.0, 3.0)


def test_read_data_returns_numeric_and_text_columns(tmp_path: Path) -> None:
    data = load_case(write_case(tmp_path)).read_data()
    assert data is not None
    assert list(data["variant"]) == ["control", "control", "treatment", "treatment"]
    assert data["value"].dtype == np.float64
    np.testing.assert_array_equal(data["value"], [1.0, 2.0, 2.5, 2.5])


def test_parametric_case_has_no_data(tmp_path: Path) -> None:
    case = load_case(write_case(tmp_path, "power", "p", csv_text=None, data=None))
    assert case.read_data() is None


def test_read_csv_columns_rejects_ragged_rows(tmp_path: Path) -> None:
    path = tmp_path / "data.csv"
    path.write_text("a,b\n1,2\n3\n", encoding="utf-8")
    with pytest.raises(GoldenFormatError, match="line 3"):
        read_csv_columns(path)


def test_read_csv_columns_rejects_empty_file(tmp_path: Path) -> None:
    path = tmp_path / "data.csv"
    path.write_text("a,b\n", encoding="utf-8")
    with pytest.raises(GoldenFormatError, match="no rows"):
        read_csv_columns(path)


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"schema_version": 2}, "schema_version"),
        ({"id": "welch/other"}, "id"),
        ({"method": "nope"}, "unknown method"),
        ({"description": ""}, "description"),
        ({"params": []}, "params"),
        ({"expected": {}}, "expected"),
        ({"expected": {"estimate": float("nan")}}, "estimate"),
        ({"expected": {"estimate": "1.0"}}, "estimate"),
        ({"expected": {"flags": []}}, "flags"),
        ({"decision": 3}, "decision"),
        ({"tolerance": {}}, "default"),
        ({"tolerance": {"default": {"abs": -1, "rel": 0}}}, "abs"),
        ({"tolerance": {"default": {"abs": 0}}}, "rel"),
        ({"source": {"tool": "scipy", "version": "1.14.1"}}, "call"),
        ({"data": "data.parquet"}, "csv"),
        ({"extra": 1}, "unknown key"),
    ],
)
def test_load_case_rejects_malformed_truth(tmp_path: Path, overrides: dict, message: str) -> None:
    with pytest.raises(GoldenFormatError, match=message):
        load_case(write_case(tmp_path, **overrides))


def test_load_case_rejects_missing_required_key(tmp_path: Path) -> None:
    case_dir = write_case(tmp_path)
    truth = {k: v for k, v in BASE_TRUTH.items() if k != "source"}
    (case_dir / "truth.json").write_text(json.dumps(truth), encoding="utf-8")
    with pytest.raises(GoldenFormatError, match="source"):
        load_case(case_dir)


def test_load_case_rejects_missing_data_file(tmp_path: Path) -> None:
    with pytest.raises(GoldenFormatError, match="data.csv"):
        load_case(write_case(tmp_path, csv_text=None))


def test_load_case_rejects_invalid_json(tmp_path: Path) -> None:
    case_dir = write_case(tmp_path)
    (case_dir / "truth.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(GoldenFormatError, match="truth.json"):
        load_case(case_dir)


def test_load_case_rejects_non_kebab_case_names(tmp_path: Path) -> None:
    with pytest.raises(GoldenFormatError, match="kebab"):
        load_case(write_case(tmp_path, "welch", "Bad_Name"))


def test_load_dataset_returns_cases_sorted_by_id(tmp_path: Path) -> None:
    write_case(tmp_path, "welch", "b")
    write_case(tmp_path, "srm", "a", method="srm_chisquare")
    write_case(tmp_path, "welch", "a")
    assert [c.id for c in load_dataset(tmp_path)] == ["srm/a", "welch/a", "welch/b"]


def test_load_dataset_rejects_a_case_dir_without_truth(tmp_path: Path) -> None:
    write_case(tmp_path)
    (tmp_path / "welch" / "half-done").mkdir()
    with pytest.raises(GoldenFormatError, match="half-done"):
        load_dataset(tmp_path)


def test_load_dataset_rejects_empty_or_missing_root(tmp_path: Path) -> None:
    with pytest.raises(GoldenFormatError, match="no golden cases"):
        load_dataset(tmp_path)
    with pytest.raises(GoldenFormatError, match="not a directory"):
        load_dataset(tmp_path / "missing")
