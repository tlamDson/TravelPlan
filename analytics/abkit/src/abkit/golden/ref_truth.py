"""G-ref truth: each method computed by scipy / statsmodels, never by abkit.

This module may import nothing from abkit, so the engine can never vouch for
itself (``test_golden_reference.py`` enforces it). statsmodels (the
``[golden]`` extra) is imported lazily, only by the methods that need it.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

import numpy as np
import scipy
from scipy import stats

STATSMODELS_METHODS = frozenset(
    {
        "power_ttest_ind",
        "sample_size_ttest_ind",
        "mde_ttest_ind",
        "sample_size_proportions",
        "bh_fdr",
    }
)

Data = dict[str, np.ndarray] | None


@dataclass(frozen=True)
class Reference:
    expected: dict[str, Any]
    decision: str | None
    source: dict[str, str]


def _scipy_source(call: str) -> dict[str, str]:
    return {"tool": "scipy", "version": scipy.__version__, "call": call}


def _numpy_scipy_source(call: str) -> dict[str, str]:
    version = f"numpy {np.__version__}, scipy {scipy.__version__}"
    return {"tool": "numpy+scipy", "version": version, "call": call}


def _statsmodels_source(call: str) -> dict[str, str]:
    import statsmodels

    return {"tool": "statsmodels", "version": statsmodels.__version__, "call": call}


def _split(data: Mapping[str, np.ndarray], column: str) -> tuple[np.ndarray, np.ndarray]:
    variant = data["variant"]
    return data[column][variant == "control"], data[column][variant == "treatment"]


def _significance(p_value: float, alpha: float) -> str:
    return "reject_null" if p_value < alpha else "fail_to_reject"


def _welch(control: np.ndarray, treatment: np.ndarray, params: Mapping[str, Any]):
    alternative = params["alternative"]
    res = stats.ttest_ind(treatment, control, equal_var=False, alternative=alternative)
    expected = {
        "estimate": float(treatment.mean() - control.mean()),
        "statistic": float(res.statistic),
        "df": float(res.df),
        "p_value": float(res.pvalue),
    }
    if alternative == "two-sided":
        ci = res.confidence_interval(1 - params["alpha"])
        expected.update(ci_low=float(ci.low), ci_high=float(ci.high))
    return expected


def _welch_ttest(data: Data, params: Mapping[str, Any]) -> Reference:
    expected = _welch(*_split(data, "value"), params)
    return Reference(
        expected,
        _significance(expected["p_value"], params["alpha"]),
        _scipy_source(
            "scipy.stats.ttest_ind(treatment, control, equal_var=False, alternative=alternative)"
            "; estimate = mean(treatment) - mean(control); CI = confidence_interval(1 - alpha)"
        ),
    )


def _ratio_and_var(y: np.ndarray, x: np.ndarray) -> tuple[float, float]:
    ratio = y.mean() / x.mean()
    cov = np.cov(y, x, ddof=1)
    var = (cov[0, 0] - 2 * ratio * cov[0, 1] + ratio**2 * cov[1, 1]) / (len(y) * x.mean() ** 2)
    return float(ratio), float(var)


def _delta_ratio(data: Data, params: Mapping[str, Any]) -> Reference:
    (y_c, y_t), (x_c, x_t) = _split(data, "numerator"), _split(data, "denominator")
    r_c, v_c = _ratio_and_var(y_c, x_c)
    r_t, v_t = _ratio_and_var(y_t, x_t)
    estimate, se = r_t - r_c, math.sqrt(v_c + v_t)
    z = estimate / se
    p_value = float(2 * stats.norm.sf(abs(z)))
    half = float(stats.norm.ppf(1 - params["alpha"] / 2)) * se
    expected = {
        "ratio_control": r_c,
        "ratio_treatment": r_t,
        "estimate": estimate,
        "se": se,
        "statistic": z,
        "p_value": p_value,
        "ci_low": estimate - half,
        "ci_high": estimate + half,
    }
    return Reference(
        expected,
        _significance(p_value, params["alpha"]),
        _numpy_scipy_source(
            "delta method for a ratio of means (Deng, Knoblich & Lu, KDD 2018): per group "
            "R = mean(y)/mean(x), Var(R) = (var_y - 2 R cov_xy + R^2 var_x) / (n mean_x^2) "
            "with ddof=1; two-sided z-test on R_t - R_c via scipy.stats.norm"
        ),
    )


def _cuped(data: Data, params: Mapping[str, Any]) -> Reference:
    y, x = data["value"], data["covariate"]
    cov = np.cov(y, x, ddof=1)
    theta = float(cov[0, 1] / cov[1, 1])
    adjusted = y - theta * (x - x.mean())
    variant = data["variant"]
    expected = {
        "theta": theta,
        "variance_reduction": float(1 - adjusted.var(ddof=1) / y.var(ddof=1)),
        **_welch(adjusted[variant == "control"], adjusted[variant == "treatment"], params),
    }
    return Reference(
        expected,
        _significance(expected["p_value"], params["alpha"]),
        _numpy_scipy_source(
            "CUPED (Deng et al., WSDM 2013): theta = cov(y, x) / var(x) pooled over all users "
            "(ddof=1); y_adj = y - theta (x - mean(x)); variance_reduction = "
            "1 - var(y_adj)/var(y); then scipy.stats.ttest_ind(equal_var=False) on y_adj"
        ),
    )


def _srm_chisquare(data: Data, params: Mapping[str, Any]) -> Reference:
    observed, share = data["count"], data["expected_share"]
    res = stats.chisquare(observed, share / share.sum() * observed.sum())
    expected = {"statistic": float(res.statistic), "p_value": float(res.pvalue)}
    expected["dof"] = len(observed) - 1
    decision = "srm" if expected["p_value"] < params["threshold"] else "no_srm"
    return Reference(
        expected,
        decision,
        _scipy_source(
            "scipy.stats.chisquare(count, expected_share / sum(expected_share) * sum(count)); "
            "decision srm when p_value < threshold"
        ),
    )


def _power_ttest_ind(data: Data, params: Mapping[str, Any]) -> Reference:
    from statsmodels.stats.power import TTestIndPower

    keys = ("effect_size", "nobs1", "alpha", "ratio", "alternative")
    power = TTestIndPower().power(**{k: params[k] for k in keys})
    return Reference(
        {"power": float(np.squeeze(power))},
        None,
        _statsmodels_source(
            "statsmodels.stats.power.TTestIndPower().power("
            "effect_size, nobs1, alpha, ratio, alternative)"
        ),
    )


def _solve_ttest(params: Mapping[str, Any], unknown: str) -> float:
    from statsmodels.stats.power import TTestIndPower

    keys = ("effect_size", "nobs1", "alpha", "power", "ratio", "alternative")
    kwargs = {k: params.get(k) for k in keys}
    kwargs[unknown] = None
    return float(np.squeeze(TTestIndPower().solve_power(**kwargs)))


def _sample_size_ttest_ind(data: Data, params: Mapping[str, Any]) -> Reference:
    return Reference(
        {"nobs1": _solve_ttest(params, "nobs1")},
        None,
        _statsmodels_source(
            "statsmodels.stats.power.TTestIndPower().solve_power(effect_size, nobs1=None, "
            "alpha, power, ratio, alternative); nobs1 not rounded up"
        ),
    )


def _mde_ttest_ind(data: Data, params: Mapping[str, Any]) -> Reference:
    return Reference(
        {"effect_size": _solve_ttest(params, "effect_size")},
        None,
        _statsmodels_source(
            "statsmodels.stats.power.TTestIndPower().solve_power(effect_size=None, nobs1, "
            "alpha, power, ratio, alternative)"
        ),
    )


def _sample_size_proportions(data: Data, params: Mapping[str, Any]) -> Reference:
    from statsmodels.stats.power import NormalIndPower
    from statsmodels.stats.proportion import proportion_effectsize

    h = float(proportion_effectsize(params["p_treatment"], params["p_control"]))
    keys = ("alpha", "power", "ratio", "alternative")
    nobs1 = NormalIndPower().solve_power(effect_size=h, nobs1=None, **{k: params[k] for k in keys})
    return Reference(
        {"effect_size": h, "nobs1": float(np.squeeze(nobs1))},
        None,
        _statsmodels_source(
            "h = statsmodels.stats.proportion.proportion_effectsize(p_treatment, p_control) "
            "(Cohen's h); statsmodels.stats.power.NormalIndPower().solve_power(h, nobs1=None, "
            "alpha, power, ratio, alternative); nobs1 not rounded up"
        ),
    )


def _bh_fdr(data: Data, params: Mapping[str, Any]) -> Reference:
    from statsmodels.stats.multitest import multipletests

    reject, adjusted, _, _ = multipletests(data["p_value"], alpha=params["alpha"], method="fdr_bh")
    return Reference(
        {"p_adjusted": [float(v) for v in adjusted], "rejected": [bool(v) for v in reject]},
        None,
        _statsmodels_source(
            "statsmodels.stats.multitest.multipletests(p_value, alpha, method='fdr_bh'); "
            "outputs in input row order"
        ),
    )


_REFERENCES: dict[str, Callable[[Data, Mapping[str, Any]], Reference]] = {
    "welch_ttest": _welch_ttest,
    "delta_ratio": _delta_ratio,
    "cuped": _cuped,
    "srm_chisquare": _srm_chisquare,
    "power_ttest_ind": _power_ttest_ind,
    "sample_size_ttest_ind": _sample_size_ttest_ind,
    "mde_ttest_ind": _mde_ttest_ind,
    "sample_size_proportions": _sample_size_proportions,
    "bh_fdr": _bh_fdr,
}


def compute_reference(method: str, data: Data, params: Mapping[str, Any]) -> Reference:
    if method not in _REFERENCES:
        raise KeyError(f"no reference computation for method {method!r}")
    return _REFERENCES[method](data, params)
