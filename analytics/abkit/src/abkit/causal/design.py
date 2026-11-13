"""Design matrices from a small term language: ``age``, ``age^2``, ``u74*black``.

A term is one or more factors joined by ``*``; a factor is a column name with an optional
integer power ``^k`` (k >= 1). The matrix always starts with an intercept column.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence

import numpy as np

_FACTOR = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)(?:\^([1-9][0-9]*))?$")


def _column(columns: Mapping[str, np.ndarray], name: str) -> np.ndarray:
    if name not in columns:
        raise ValueError(f"unknown column {name!r}; have {sorted(columns)}")
    values = np.asarray(columns[name])
    if values.dtype.kind not in "biuf":
        raise ValueError(f"column {name!r} must be numeric, got {values.dtype}")
    values = values.astype(np.float64)
    if not np.all(np.isfinite(values)):
        raise ValueError(f"column {name!r} must hold only finite values")
    return values


def _term(columns: Mapping[str, np.ndarray], term: str) -> np.ndarray:
    factors = [f.strip() for f in term.split("*")]
    if not term.strip() or any(not f for f in factors):
        raise ValueError(f"malformed term {term!r}")
    product = None
    for factor in factors:
        match = _FACTOR.match(factor)
        if match is None:
            raise ValueError(f"malformed term {term!r}: bad factor {factor!r}")
        values = _column(columns, match.group(1)) ** int(match.group(2) or 1)
        product = values if product is None else product * values
    return product


def design_matrix(
    columns: Mapping[str, np.ndarray],
    terms: Sequence[str],
    rows: np.ndarray | None = None,
) -> np.ndarray:
    """``[1, term_1, ..., term_k]`` for every row (or the rows where ``rows`` is True)."""
    normalized = ["".join(t.split()) for t in terms]
    if len(set(normalized)) != len(normalized):
        raise ValueError(f"duplicate terms in {list(terms)}")
    if not columns:
        raise ValueError("no data columns")
    n = len(next(iter(columns.values())))
    parts = [np.ones(n)] + [_term(columns, t) for t in terms]
    matrix = np.column_stack(parts)
    return matrix if rows is None else matrix[np.asarray(rows, dtype=bool)]
