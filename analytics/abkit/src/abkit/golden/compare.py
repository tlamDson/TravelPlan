"""Compare an implementation's outputs with a golden case's frozen truth."""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

import numpy as np

from abkit.golden.case import GoldenCase, Tolerance


def _as_list(value: Any) -> list[Any] | None:
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, list | tuple):
        return list(value)
    return None


def _scalar(value: Any) -> Any:
    return value.item() if isinstance(value, np.generic) else value


def _compare_scalar(label: str, expected: Any, actual: Any, tol: Tolerance) -> str | None:
    actual = _scalar(actual)
    if isinstance(expected, bool):
        if isinstance(actual, bool) and actual == expected:
            return None
        return f"{label}: expected {expected!r}, got {actual!r}"
    if isinstance(actual, bool) or not isinstance(actual, int | float) or not math.isfinite(actual):
        return f"{label}: expected a finite number near {expected!r}, got {actual!r}"
    if tol.allows(expected, actual):
        return None
    return (
        f"{label}: expected {expected!r}, got {actual!r} "
        f"(diff {abs(actual - expected):.3g}, tol abs={tol.abs:g} rel={tol.rel:g})"
    )


def compare_outputs(case: GoldenCase, actual: Mapping[str, Any]) -> list[str]:
    """One message per mismatch; an empty list means the case passes.

    Every key of ``case.expected`` must be in ``actual`` and within its
    tolerance; extra output keys are ignored. When the truth has a decision,
    ``actual["decision"]`` must equal it.
    """
    mismatches: list[str] = []
    for key, expected in case.expected.items():
        if key not in actual:
            mismatches.append(f"{key}: missing from output")
            continue
        tol = case.tolerance_for(key)
        if isinstance(expected, list):
            got = _as_list(actual[key])
            if got is None:
                mismatches.append(f"{key}: expected a list, got {actual[key]!r}")
                continue
            if len(got) != len(expected):
                mismatches.append(f"{key}: expected {len(expected)} values, got {len(got)}")
                continue
            for i, (e, a) in enumerate(zip(expected, got, strict=True)):
                message = _compare_scalar(f"{key}[{i}]", e, a, tol)
                if message:
                    mismatches.append(message)
        else:
            message = _compare_scalar(key, expected, actual[key], tol)
            if message:
                mismatches.append(message)
    if case.decision is not None and actual.get("decision") != case.decision:
        mismatches.append(f"decision: expected {case.decision!r}, got {actual.get('decision')!r}")
    return mismatches
