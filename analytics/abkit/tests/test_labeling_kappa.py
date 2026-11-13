"""abkit.labeling.cohen_kappa: agreement beyond chance between two raters (M11, PR 15b)."""

import math

import numpy as np
import pytest

from abkit.labeling import LABELS, cohen_kappa


def _pairs(counts: dict[tuple[str, str], int]) -> tuple[list[str], list[str]]:
    a, b = [], []
    for (x, y), n in counts.items():
        a += [x] * n
        b += [y] * n
    return a, b


def test_labels_are_the_three_g_decide_decisions() -> None:
    assert LABELS == ("ship", "no_ship", "investigate")


def test_textbook_two_by_two_example() -> None:
    # 50 items: both yes 20, A yes B no 5, A no B yes 10, both no 15 -> po 0.7, pe 0.5.
    a, b = _pairs(
        {
            ("ship", "ship"): 20,
            ("ship", "no_ship"): 5,
            ("no_ship", "ship"): 10,
            ("no_ship", "no_ship"): 15,
        }
    )
    k = cohen_kappa(a, b)
    assert k.n == 50
    assert k.observed == pytest.approx(0.7)
    assert k.expected == pytest.approx(0.5)
    assert k.kappa == pytest.approx(0.4)
    # Cohen (1960) large-sample SE: sqrt(po (1 - po) / (n (1 - pe)^2)).
    assert k.se == pytest.approx(math.sqrt(0.7 * 0.3 / (50 * 0.25)))
    assert k.ci_low == pytest.approx(0.4 - 1.959963984540054 * k.se)
    assert k.ci_high == pytest.approx(0.4 + 1.959963984540054 * k.se)


def test_confusion_matrix_rows_are_the_first_rater_in_label_order() -> None:
    a = ["ship", "ship", "investigate", "no_ship"]
    b = ["ship", "no_ship", "investigate", "no_ship"]
    k = cohen_kappa(a, b)
    assert k.categories == LABELS
    assert k.confusion.tolist() == [[1, 1, 0], [0, 1, 0], [0, 0, 1]]


def test_three_categories_match_a_hand_computed_kappa() -> None:
    rng = np.random.default_rng(3)
    a = rng.choice(LABELS, 40).tolist()
    b = [x if rng.random() < 0.6 else str(rng.choice(LABELS)) for x in a]
    po = np.mean([x == y for x, y in zip(a, b, strict=True)])
    pe = sum(a.count(c) / 40 * b.count(c) / 40 for c in LABELS)
    assert cohen_kappa(a, b).kappa == pytest.approx((po - pe) / (1 - pe), abs=1e-12)


def test_perfect_agreement_is_one_and_chance_agreement_is_zero() -> None:
    assert cohen_kappa(["ship", "no_ship"] * 5, ["ship", "no_ship"] * 5).kappa == 1.0
    # Rater B ignores the item: half its calls match A's purely by chance.
    a = ["ship", "ship", "no_ship", "no_ship"]
    b = ["ship", "no_ship", "ship", "no_ship"]
    assert cohen_kappa(a, b).kappa == pytest.approx(0.0, abs=1e-12)


def test_kappa_is_undefined_when_both_raters_use_one_label() -> None:
    with pytest.raises(ValueError, match="undefined"):
        cohen_kappa(["ship"] * 4, ["ship"] * 4)


def test_bad_inputs_are_rejected() -> None:
    with pytest.raises(ValueError, match="same number"):
        cohen_kappa(["ship"], ["ship", "no_ship"])
    with pytest.raises(ValueError, match="at least one"):
        cohen_kappa([], [])
    with pytest.raises(ValueError, match="maybe"):
        cohen_kappa(["ship", "maybe"], ["ship", "no_ship"])
