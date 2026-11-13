"""PR 10 must pass G-ref for Welch, delta method, SRM and power/MDE (B2 plan)."""

import ast
from pathlib import Path

import numpy as np
import pytest
from conftest import GOLDEN_LATEST, GOLDEN_V1

from abkit.golden.methods import IMPLEMENTATIONS
from abkit.golden.runner import Status, run_golden

CORE_METHODS = {
    "welch_ttest",
    "delta_ratio",
    "srm_chisquare",
    "power_ttest_ind",
    "sample_size_ttest_ind",
    "mde_ttest_ind",
    "sample_size_proportions",
}
CORE_GROUPS = {"welch", "delta", "srm", "power"}
STATS_DIR = Path(__file__).resolve().parents[1] / "src/abkit/stats"


def test_core_methods_are_registered() -> None:
    assert set(IMPLEMENTATIONS) >= CORE_METHODS


def test_every_core_g_ref_case_passes() -> None:
    report = run_golden(GOLDEN_LATEST)
    core = [r for r in report.results if r.case_id.split("/")[0] in CORE_GROUPS]
    assert len(core) == 16
    failing = [(r.case_id, r.status.name, r.details) for r in core if r.status is not Status.PASS]
    assert failing == []
    assert report.ok(strict=False)


def test_v1_fails_only_the_two_power_cases_whose_truth_was_imprecise() -> None:
    """Why v2 exists: v1's t-test MDE stopped at statsmodels' xtol=1e-5 (its power is 0.79997,
    not 0.8), and v1's t-test power used cdflib's nctdtr, 8e-9 off scipy's boost nct and
    quadrature, outside its rel 1e-9 tolerance. Every other v1 case passes unchanged."""
    report = run_golden(GOLDEN_V1)
    core = [r for r in report.results if r.case_id.split("/")[0] in CORE_GROUPS]
    failing = {r.case_id for r in core if r.status is not Status.PASS}
    assert failing == {"power/ttest-mde", "power/ttest-power"}


def test_engine_does_not_reuse_the_reference_calls() -> None:
    """The truth came from ttest_ind / chisquare / statsmodels; the engine may not call them."""
    banned = {"ttest_ind", "ttest_ind_from_stats", "chisquare", "power_divergence"}
    for path in STATS_DIR.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute | ast.Name):
                name = node.attr if isinstance(node, ast.Attribute) else node.id
                assert name not in banned, f"{path.name} uses {name}"
            if isinstance(node, ast.Import | ast.ImportFrom):
                modules = [a.name for a in node.names] + [getattr(node, "module", None) or ""]
                assert not any(m.startswith("statsmodels") for m in modules), path.name


def test_adapters_split_rows_by_variant_whatever_their_order() -> None:
    data = {
        "variant": np.array(["treatment", "control", "treatment", "control"]),
        "value": np.array([3.0, 1.0, 5.0, 2.0]),
    }
    out = IMPLEMENTATIONS["welch_ttest"](data, {"alpha": 0.05, "alternative": "two-sided"})
    assert out["estimate"] == pytest.approx(2.5)
    assert out["decision"] in {"reject_null", "fail_to_reject"}


def test_adapters_reject_unknown_variants() -> None:
    data = {"variant": np.array(["control", "control", "b", "b"]), "value": np.ones(4)}
    with pytest.raises(ValueError, match="variant"):
        IMPLEMENTATIONS["welch_ttest"](data, {"alpha": 0.05, "alternative": "two-sided"})
