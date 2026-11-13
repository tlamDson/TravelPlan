"""The G-ref cases (B2 plan, PR 9a): seeded data plus params for each method.

Data are drawn from ``numpy.random.default_rng(seed)`` and rounded to 4
decimals, so ``data.csv`` holds the exact numbers the truth was computed from.
``abkit.golden.freeze_ref`` turns these into ``analytics/golden/v1``.
Changing any case here means a new dataset version (v2), not an edit of v1.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from functools import partial
from typing import Any

import numpy as np

Columns = dict[str, list[Any]]

#: Closed-form results from the data: only float summation order may differ.
EXACT = {"default": {"abs": 1e-10, "rel": 1e-9}}
#: Results statsmodels finds with a root solver: abkit may use another solver.
SOLVED = {"default": {"abs": 1e-10, "rel": 1e-6}}


@dataclass(frozen=True)
class RefCase:
    group: str
    name: str
    method: str
    description: str
    params: dict[str, Any]
    make_data: Callable[[], Columns] | None = None
    seed: int | None = None
    tolerance: dict[str, Any] = field(default_factory=lambda: EXACT)


def _r(values: np.ndarray) -> list[float]:
    return [float(v) for v in np.round(values, 4)]


def _labels(n_control: int, n_treatment: int) -> list[str]:
    return ["control"] * n_control + ["treatment"] * n_treatment


def _normal(seed: int, n_c: int, n_t: int, mu_c: float, mu_t: float, sd_c: float, sd_t: float):
    rng = np.random.default_rng(seed)
    values = np.concatenate([rng.normal(mu_c, sd_c, n_c), rng.normal(mu_t, sd_t, n_t)])
    return {"variant": _labels(n_c, n_t), "value": _r(values)}


def _lognormal(seed: int, n: int, mean: float, sigma: float, lift: float) -> Columns:
    rng = np.random.default_rng(seed)
    control = rng.lognormal(mean, sigma, n)
    treatment = rng.lognormal(mean, sigma, n) * (1 + lift)
    return {"variant": _labels(n, n), "value": _r(np.concatenate([control, treatment]))}


def _bernoulli(seed: int, n: int, p_c: float, p_t: float) -> Columns:
    rng = np.random.default_rng(seed)
    values = np.concatenate([rng.random(n) < p_c, rng.random(n) < p_t]).astype(int)
    return {"variant": _labels(n, n), "value": [int(v) for v in values]}


def _ratio(seed: int, n_c: int, n_t: int, lam: float, p_c: float, p_t: float) -> Columns:
    """Per-user clicks (numerator) over sessions (denominator): a CTR ratio metric."""
    rng = np.random.default_rng(seed)
    sessions = rng.poisson(lam, n_c + n_t) + 1
    p = np.array([p_c] * n_c + [p_t] * n_t)
    clicks = rng.binomial(sessions, p)
    return {
        "variant": _labels(n_c, n_t),
        "numerator": [int(v) for v in clicks],
        "denominator": [int(v) for v in sessions],
    }


def _cuped(seed: int, n: int, slope: float, noise_sd: float, effect: float) -> Columns:
    """Pre-period covariate ~ N(20, 4); in-period value = 20 + slope*(x-20) + noise."""
    rng = np.random.default_rng(seed)
    x = rng.normal(20.0, 4.0, 2 * n)
    lift = np.array([0.0] * n + [effect] * n)
    y = 20.0 + slope * (x - 20.0) + rng.normal(0.0, noise_sd, 2 * n) + lift
    return {"variant": _labels(n, n), "value": _r(y), "covariate": _r(x)}


def _counts(variants: list[str], counts: list[int], shares: list[float]) -> Columns:
    return {"variant": variants, "count": counts, "expected_share": shares}


def _pvalues(values: list[float]) -> Columns:
    return {"hypothesis": [f"h{i + 1:02d}" for i in range(len(values))], "p_value": values}


TWO_SIDED = {"alpha": 0.05, "alternative": "two-sided"}

# fmt: off
REF_CASES: tuple[RefCase, ...] = (
    # Welch t-test: scipy.stats.ttest_ind(equal_var=False)
    RefCase("welch", "equal-n-lift", "welch_ttest",
            "500 vs 500 normal users, sd 2, true lift +0.4.",
            TWO_SIDED, partial(_normal, 101, 500, 500, 10.0, 10.4, 2.0, 2.0), 101),
    RefCase("welch", "unequal-n-unequal-var", "welch_ttest",
            "300 control users with sd 1 against 800 treatment users with sd 3, lift +0.3.",
            TWO_SIDED, partial(_normal, 102, 300, 800, 5.0, 5.3, 1.0, 3.0), 102),
    RefCase("welch", "aa-null", "welch_ttest",
            "A/A: 400 vs 400 users from the same N(0, 1).",
            TWO_SIDED, partial(_normal, 103, 400, 400, 0.0, 0.0, 1.0, 1.0), 103),
    RefCase("welch", "one-sided-greater", "welch_ttest",
            "250 vs 250 users, lift +0.2, one-sided test that treatment is greater.",
            {"alpha": 0.05, "alternative": "greater"},
            partial(_normal, 104, 250, 250, 1.0, 1.2, 1.0, 1.0), 104),
    RefCase("welch", "lognormal-revenue", "welch_ttest",
            "Long-tailed revenue: 1,000 vs 1,000 lognormal(1, 1) users, treatment x1.05.",
            TWO_SIDED, partial(_lognormal, 105, 1000, 1.0, 1.0, 0.05), 105),
    RefCase("welch", "binary-conversion", "welch_ttest",
            "0/1 conversion, 2,000 vs 2,000 users, 10% against 12%.",
            TWO_SIDED, partial(_bernoulli, 106, 2000, 0.10, 0.12), 106),
    # Delta method for a ratio metric (clicks / sessions per user)
    RefCase("delta", "ctr-lift", "delta_ratio",
            "1,000 vs 1,000 users, CTR 10% against 11%.",
            {"alpha": 0.05}, partial(_ratio, 201, 1000, 1000, 4.0, 0.10, 0.11), 201),
    RefCase("delta", "aa-null", "delta_ratio",
            "A/A: 800 vs 800 users, CTR 10% in both.",
            {"alpha": 0.05}, partial(_ratio, 202, 800, 800, 4.0, 0.10, 0.10), 202),
    RefCase("delta", "unequal-sizes", "delta_ratio",
            "400 control against 1,200 treatment users, CTR 20% against 21%, alpha 0.1.",
            {"alpha": 0.10}, partial(_ratio, 203, 400, 1200, 6.0, 0.20, 0.21), 203),
    # CUPED: pooled theta, then Welch on the adjusted values
    RefCase("cuped", "strong-covariate", "cuped",
            "600 vs 600 users, covariate correlation about 0.8, lift +0.5.",
            TWO_SIDED, partial(_cuped, 301, 600, 1.0, 3.0, 0.5), 301),
    RefCase("cuped", "weak-covariate", "cuped",
            "600 vs 600 users, covariate correlation about 0.2, lift +0.5.",
            TWO_SIDED, partial(_cuped, 302, 600, 0.2, 4.0, 0.5), 302),
    RefCase("cuped", "aa-null", "cuped",
            "A/A: 500 vs 500 users, covariate correlation about 0.8.",
            TWO_SIDED, partial(_cuped, 303, 500, 1.0, 3.0, 0.0), 303),
    # SRM: chi-square goodness of fit, p < 0.0005 flags a sample ratio mismatch
    RefCase("srm", "balanced-ok", "srm_chisquare",
            "Planned 50/50, observed 5,012 / 4,988.",
            {"threshold": 0.0005},
            partial(_counts, ["control", "treatment"], [5012, 4988], [0.5, 0.5])),
    RefCase("srm", "broken-50-50", "srm_chisquare",
            "Planned 50/50, observed 5,200 / 4,800: a broken split.",
            {"threshold": 0.0005},
            partial(_counts, ["control", "treatment"], [5200, 4800], [0.5, 0.5])),
    RefCase("srm", "three-way-holdout-ok", "srm_chisquare",
            "Planned 10% holdout and 45/45, observed 1,003 / 4,511 / 4,486.",
            {"threshold": 0.0005},
            partial(_counts, ["holdout", "control", "treatment"], [1003, 4511, 4486],
                    [0.1, 0.45, 0.45])),
    # Power and MDE: statsmodels.stats.power
    RefCase("power", "ttest-power", "power_ttest_ind",
            "Power of a two-sided t-test, d = 0.2, 400 per group.",
            {"effect_size": 0.2, "nobs1": 400, "ratio": 1.0, **TWO_SIDED}),
    RefCase("power", "ttest-sample-size", "sample_size_ttest_ind",
            "Users per group for 80% power at d = 0.1, treatment group twice control.",
            {"effect_size": 0.1, "power": 0.8, "ratio": 2.0, **TWO_SIDED},
            tolerance=SOLVED),
    RefCase("power", "ttest-mde", "mde_ttest_ind",
            "Smallest d detectable with 80% power and 5,000 per group.",
            {"nobs1": 5000, "power": 0.8, "ratio": 1.0, **TWO_SIDED}, tolerance=SOLVED),
    RefCase("power", "proportions-sample-size", "sample_size_proportions",
            "Users per group to see save_trip go from 10% to 10.3% with 80% power.",
            {"p_control": 0.10, "p_treatment": 0.103, "power": 0.8, "ratio": 1.0, **TWO_SIDED},
            tolerance=SOLVED),
    # Benjamini-Hochberg FDR: statsmodels.stats.multitest.multipletests(method="fdr_bh")
    RefCase("bh", "mixed-ten", "bh_fdr", "Ten metrics, three clearly moved, alpha 0.05.",
            {"alpha": 0.05},
            partial(_pvalues, [0.0001, 0.0008, 0.0039, 0.0210, 0.0410, 0.0600, 0.0740,
                               0.2050, 0.5120, 0.9000])),
    RefCase("bh", "all-null-alpha-10", "bh_fdr", "Eight null metrics, alpha 0.10.",
            {"alpha": 0.10},
            partial(_pvalues, [0.0450, 0.1300, 0.2400, 0.3300, 0.4700, 0.6100, 0.8200,
                               0.9900])),
    RefCase("bh", "ties-unsorted", "bh_fdr", "Unsorted input with ties and a p of 1.",
            {"alpha": 0.05},
            partial(_pvalues, [0.0300, 0.0100, 0.0300, 1.0000, 0.0040, 0.0100])),
)
# fmt: on
