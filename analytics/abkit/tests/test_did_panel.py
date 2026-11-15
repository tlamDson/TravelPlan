"""The DiD panel container and the placebo shift (B2 plan, PR 19)."""

import numpy as np
import pytest

from abkit.did.panel import NEVER, DidPanel, placebo_shift


def _panel() -> DidPanel:
    return DidPanel.from_arrays(
        unit=["b", "b", "b", "a", "a", "a", "c", "c"],
        time=[0, 1, 2, 0, 1, 2, 0, 2],
        y=[1.0, 2.0, 3.0, 0.5, 0.5, 0.5, 9.0, 8.0],
        cohort=[2, 2, 2, NEVER, NEVER, NEVER, 7, 7],
    )


def test_from_arrays_codes_units_in_sorted_order_with_unit_weights() -> None:
    panel = _panel()
    assert panel.units == ("a", "b", "c")
    assert panel.unit.tolist() == [1, 1, 1, 0, 0, 0, 2, 2]
    assert panel.weight.tolist() == [1.0] * 8
    assert panel.n_units == 3
    assert panel.n_obs == 8


def test_controls_are_never_treated_and_units_adopting_after_the_last_period() -> None:
    panel = _panel()
    assert panel.is_control.tolist() == [False] * 3 + [True] * 5
    assert panel.is_late.tolist() == [False] * 6 + [True] * 2


def test_subset_keeps_the_unit_labels_of_the_rows_left() -> None:
    sub = _panel().subset(np.array([True, True, True, False, False, False, True, True]))
    assert sub.units == ("b", "c")
    assert sub.unit.tolist() == [0, 0, 0, 1, 1]
    assert sub.cohort.tolist() == [2, 2, 2, 7, 7]


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("y", [1.0, float("nan")], "finite"),
        ("time", [0, -1], "non-negative"),
        ("weight", [1.0, 0.0], "positive"),
        ("cohort", [1, 2], "constant within"),
        ("time", [0, 0], "once per unit and period"),
    ],
)
def test_from_arrays_rejects_bad_input(field: str, value: list, message: str) -> None:
    args = {"unit": ["a", "a"], "time": [0, 1], "y": [1.0, 2.0], "cohort": [1, 1]}
    args["weight"] = [1.0, 1.0]
    args[field] = value
    with pytest.raises(ValueError, match=message):
        DidPanel.from_arrays(**args)


def test_from_arrays_rejects_arrays_of_different_lengths() -> None:
    with pytest.raises(ValueError, match="length"):
        DidPanel.from_arrays(unit=["a"], time=[0, 1], y=[1.0, 2.0], cohort=[NEVER, NEVER])


def test_placebo_shift_keeps_only_pre_adoption_rows_of_the_treated_and_moves_adoption() -> None:
    shifted = placebo_shift(_panel(), 1)
    assert shifted.units == ("a", "b", "c")
    b = shifted.unit == 1
    assert shifted.time[b].tolist() == [0, 1]
    assert set(shifted.cohort[b].tolist()) == {1}
    # controls, the late adopter included, keep every row and their cohort
    assert shifted.time[shifted.unit == 2].tolist() == [0, 2]
    assert set(shifted.cohort[shifted.unit == 2].tolist()) == {7}
    assert shifted.n_obs == 7


def test_placebo_shift_must_be_positive() -> None:
    with pytest.raises(ValueError, match="shift"):
        placebo_shift(_panel(), 0)
