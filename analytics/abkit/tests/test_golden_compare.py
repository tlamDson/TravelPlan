from pathlib import Path

import numpy as np
from conftest import write_case

from abkit.golden.case import load_case
from abkit.golden.compare import compare_outputs


def _case(tmp_path: Path, **overrides):
    return load_case(write_case(tmp_path, **overrides))


def test_matching_outputs_have_no_mismatches(tmp_path: Path) -> None:
    case = _case(tmp_path)
    actual = {"estimate": 1.0 + 1e-12, "p_value": 0.25, "decision": "fail_to_reject"}
    assert compare_outputs(case, actual) == []


def test_numpy_scalars_and_extra_keys_are_accepted(tmp_path: Path) -> None:
    case = _case(tmp_path)
    actual = {
        "estimate": np.float64(1.0),
        "p_value": np.float64(0.25),
        "decision": "fail_to_reject",
        "df": 3.0,
    }
    assert compare_outputs(case, actual) == []


def test_value_outside_tolerance_is_reported_with_both_numbers(tmp_path: Path) -> None:
    case = _case(tmp_path)
    mismatches = compare_outputs(
        case, {"estimate": 1.1, "p_value": 0.25, "decision": "fail_to_reject"}
    )
    assert len(mismatches) == 1
    assert "estimate" in mismatches[0]
    assert "1.0" in mismatches[0] and "1.1" in mismatches[0]


def test_missing_output_key_is_a_mismatch(tmp_path: Path) -> None:
    mismatches = compare_outputs(_case(tmp_path), {"estimate": 1.0, "decision": "fail_to_reject"})
    assert mismatches == ["p_value: missing from output"]


def test_wrong_decision_is_a_mismatch(tmp_path: Path) -> None:
    mismatches = compare_outputs(
        _case(tmp_path), {"estimate": 1.0, "p_value": 0.25, "decision": "reject_null"}
    )
    assert mismatches == ["decision: expected 'fail_to_reject', got 'reject_null'"]


def test_decision_is_not_checked_when_truth_has_none(tmp_path: Path) -> None:
    case = _case(tmp_path, decision=None)
    assert compare_outputs(case, {"estimate": 1.0, "p_value": 0.25}) == []


def test_non_numeric_output_is_a_mismatch(tmp_path: Path) -> None:
    mismatches = compare_outputs(
        _case(tmp_path),
        {"estimate": "1.0", "p_value": float("nan"), "decision": "fail_to_reject"},
    )
    assert [m.split(":")[0] for m in mismatches] == ["estimate", "p_value"]


def test_lists_compare_elementwise_and_by_length(tmp_path: Path) -> None:
    case = _case(
        tmp_path,
        method="bh_fdr",
        decision=None,
        expected={"p_adjusted": [0.01, 0.2], "rejected": [True, False]},
    )
    assert compare_outputs(case, {"p_adjusted": [0.01, 0.2], "rejected": [True, False]}) == []
    assert (
        compare_outputs(
            case, {"p_adjusted": np.array([0.01, 0.2]), "rejected": np.array([True, False])}
        )
        == []
    )
    mismatches = compare_outputs(case, {"p_adjusted": [0.01, 0.3], "rejected": [True]})
    assert mismatches[0].startswith("p_adjusted[1]:")
    assert mismatches[1] == "rejected: expected 2 values, got 1"


def test_bools_must_match_exactly(tmp_path: Path) -> None:
    case = _case(tmp_path, method="bh_fdr", decision=None, expected={"rejected": [True, False]})
    assert compare_outputs(case, {"rejected": [1.0, 0.0]}) == [
        "rejected[0]: expected True, got 1.0",
        "rejected[1]: expected False, got 0.0",
    ]
