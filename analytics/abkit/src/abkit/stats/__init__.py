"""Core A/B statistics: Welch, delta method, CUPED, SRM, power/MDE (B2 plan, PR 10-11).

Estimates are always treatment minus control. Each function validates its
input and raises ``ValueError`` instead of returning NaN.
"""

from abkit.stats.cuped import CupedResult, cuped, cuped_sample_size, sample_size_multiplier
from abkit.stats.delta import DeltaResult, delta_ratio
from abkit.stats.power import (
    ProportionSampleSize,
    cohens_h,
    mde_ttest_ind,
    power_proportions,
    power_ttest_ind,
    sample_size_proportions,
    sample_size_ttest_ind,
)
from abkit.stats.srm import SRM_THRESHOLD, SrmResult, srm_chisquare
from abkit.stats.welch import WelchResult, welch_ttest

__all__ = [
    "SRM_THRESHOLD",
    "CupedResult",
    "DeltaResult",
    "ProportionSampleSize",
    "SrmResult",
    "WelchResult",
    "cohens_h",
    "cuped",
    "cuped_sample_size",
    "delta_ratio",
    "mde_ttest_ind",
    "power_proportions",
    "power_ttest_ind",
    "sample_size_multiplier",
    "sample_size_proportions",
    "sample_size_ttest_ind",
    "srm_chisquare",
    "welch_ttest",
]
