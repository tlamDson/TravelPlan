"""Methods a golden case may name, and the abkit code that answers each one.

``KNOWN_METHODS`` is the contract: ``analytics/golden/README.md`` lists the
data columns, params and output keys of each. ``IMPLEMENTATIONS`` maps a
method to an abkit function ``(data, params) -> outputs``; the statistics PRs
(B2 plan, PR 10 onward) register theirs here. A case whose method has no
implementation yet is reported as MISSING, never as passing.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import asdict
from typing import Any

import numpy as np

from abkit import stats
from abkit.golden.case import KNOWN_METHODS

Data = dict[str, np.ndarray] | None
__all__ = ["IMPLEMENTATIONS", "KNOWN_METHODS", "Data", "Implementation"]

Implementation = Callable[[Data, Mapping[str, Any]], Mapping[str, Any]]

_VARIANTS = {"control", "treatment"}


def _split(data: Data, column: str) -> tuple[np.ndarray, np.ndarray]:
    variant = data["variant"]
    unknown = set(variant.tolist()) - _VARIANTS
    if unknown:
        raise ValueError(f"unknown variant(s) {sorted(unknown)}; expected control/treatment")
    return data[column][variant == "control"], data[column][variant == "treatment"]


def _with_decision(result: Any) -> dict[str, Any]:
    return {**asdict(result), "decision": result.decision}


def _welch(data: Data, params: Mapping[str, Any]) -> Mapping[str, Any]:
    control, treatment = _split(data, "value")
    return _with_decision(
        stats.welch_ttest(control, treatment, params["alpha"], params["alternative"])
    )


def _delta(data: Data, params: Mapping[str, Any]) -> Mapping[str, Any]:
    (y_c, y_t), (x_c, x_t) = _split(data, "numerator"), _split(data, "denominator")
    return _with_decision(
        stats.delta_ratio(
            y_c, x_c, y_t, x_t, params["alpha"], params.get("alternative", "two-sided")
        )
    )


def _srm(data: Data, params: Mapping[str, Any]) -> Mapping[str, Any]:
    result = stats.srm_chisquare(data["count"], data["expected_share"], params["threshold"])
    return _with_decision(result)


def _pick(params: Mapping[str, Any], *keys: str) -> dict[str, Any]:
    return {k: params[k] for k in keys}


_COMMON = ("alpha", "ratio", "alternative")


def _power(data: Data, params: Mapping[str, Any]) -> Mapping[str, Any]:
    return {"power": stats.power_ttest_ind(**_pick(params, "effect_size", "nobs1", *_COMMON))}


def _sample_size(data: Data, params: Mapping[str, Any]) -> Mapping[str, Any]:
    nobs1 = stats.sample_size_ttest_ind(**_pick(params, "effect_size", "power", *_COMMON))
    return {"nobs1": nobs1}


def _mde(data: Data, params: Mapping[str, Any]) -> Mapping[str, Any]:
    return {"effect_size": stats.mde_ttest_ind(**_pick(params, "nobs1", "power", *_COMMON))}


def _sample_size_proportions(data: Data, params: Mapping[str, Any]) -> Mapping[str, Any]:
    keys = ("p_control", "p_treatment", "power", *_COMMON)
    return asdict(stats.sample_size_proportions(**_pick(params, *keys)))


def _bh(data: Data, params: Mapping[str, Any]) -> Mapping[str, Any]:
    result = stats.bh_fdr(data["p_value"], params["alpha"])
    return {"p_adjusted": list(result.p_adjusted), "rejected": list(result.rejected)}


IMPLEMENTATIONS: dict[str, Implementation] = {
    "welch_ttest": _welch,
    "delta_ratio": _delta,
    "srm_chisquare": _srm,
    "power_ttest_ind": _power,
    "sample_size_ttest_ind": _sample_size,
    "mde_ttest_ind": _mde,
    "sample_size_proportions": _sample_size_proportions,
    "bh_fdr": _bh,
}
