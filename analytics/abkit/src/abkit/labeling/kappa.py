"""Cohen's kappa: how far two raters agree beyond what their label rates give by chance."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from scipy import stats

#: The G-decide decisions (B2 plan, "Golden dataset").
LABELS: tuple[str, ...] = ("ship", "no_ship", "investigate")


@dataclass(frozen=True)
class Kappa:
    kappa: float
    #: Share of items both raters labelled the same (p_o).
    observed: float
    #: Agreement expected by chance from each rater's label rates (p_e).
    expected: float
    n: int
    #: Cohen (1960) large-sample SE, ``sqrt(p_o (1 - p_o) / (n (1 - p_e)^2))``.
    se: float
    ci_low: float
    ci_high: float
    categories: tuple[str, ...]
    #: Rows: first rater, columns: second rater, both in ``categories`` order.
    confusion: np.ndarray


def cohen_kappa(
    a: Sequence[str], b: Sequence[str], categories: Sequence[str] = LABELS, level: float = 0.95
) -> Kappa:
    """Unweighted kappa of two raters' labels of the same items, in the same order."""
    if len(a) != len(b):
        raise ValueError(f"both raters need the same number of labels, got {len(a)} and {len(b)}")
    if not a:
        raise ValueError("kappa needs at least one labelled item")
    cats = tuple(categories)
    index = {c: i for i, c in enumerate(cats)}
    unknown = sorted({x for x in (*a, *b) if x not in index})
    if unknown:
        raise ValueError(f"unknown label(s) {unknown}; expected one of {list(cats)}")
    confusion = np.zeros((len(cats), len(cats)), dtype=np.int64)
    for x, y in zip(a, b, strict=True):
        confusion[index[x], index[y]] += 1
    n = len(a)
    p = confusion / n
    observed = float(np.trace(p))
    expected = float(p.sum(axis=1) @ p.sum(axis=0))
    if math.isclose(expected, 1.0):
        raise ValueError("kappa is undefined: both raters used one and the same label throughout")
    kappa = (observed - expected) / (1 - expected)
    se = math.sqrt(observed * (1 - observed) / (n * (1 - expected) ** 2))
    z = float(stats.norm.ppf(0.5 + level / 2))
    return Kappa(
        kappa=kappa,
        observed=observed,
        expected=expected,
        n=n,
        se=se,
        ci_low=kappa - z * se,
        ci_high=kappa + z * se,
        categories=cats,
        confusion=confusion,
    )
