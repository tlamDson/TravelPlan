"""Design matrices from term lists: ``age``, ``age^2``, ``u74*black`` (B2 plan, PR 17)."""

import numpy as np
import pytest

from abkit.causal.design import design_matrix

COLUMNS = {
    "age": np.array([20.0, 30.0, 40.0]),
    "black": np.array([1.0, 0.0, 1.0]),
    "u74": np.array([1.0, 1.0, 0.0]),
}


def test_intercept_first_then_each_term_in_order() -> None:
    x = design_matrix(COLUMNS, ["age", "age^2", "u74*black"])
    expected = np.column_stack(
        [np.ones(3), [20.0, 30.0, 40.0], [400.0, 900.0, 1600.0], [1.0, 0.0, 0.0]]
    )
    np.testing.assert_array_equal(x, expected)


def test_no_terms_gives_the_intercept_only() -> None:
    np.testing.assert_array_equal(design_matrix(COLUMNS, []), np.ones((3, 1)))


def test_whitespace_and_powers_of_products_are_allowed() -> None:
    x = design_matrix(COLUMNS, [" age^3 * black "])
    np.testing.assert_array_equal(x[:, 1], [8000.0, 0.0, 64000.0])


def test_rows_can_be_restricted_with_a_mask() -> None:
    x = design_matrix(COLUMNS, ["age"], rows=np.array([True, False, True]))
    np.testing.assert_array_equal(x, [[1.0, 20.0], [1.0, 40.0]])


@pytest.mark.parametrize("term", ["", "age^", "age^0", "^2", "age**2", "age+black", "age*"])
def test_malformed_terms_raise(term: str) -> None:
    with pytest.raises(ValueError, match="term"):
        design_matrix(COLUMNS, [term])


def test_unknown_column_raises_with_its_name() -> None:
    with pytest.raises(ValueError, match="educ"):
        design_matrix(COLUMNS, ["educ"])


def test_duplicate_terms_raise() -> None:
    with pytest.raises(ValueError, match="duplicate"):
        design_matrix(COLUMNS, ["age", "age"])


def test_text_columns_and_non_finite_values_raise() -> None:
    with pytest.raises(ValueError, match="numeric"):
        design_matrix({"zip": np.array(["a", "b"])}, ["zip"])
    with pytest.raises(ValueError, match="finite"):
        design_matrix({"age": np.array([1.0, np.nan])}, ["age"])
