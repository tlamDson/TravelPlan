"""Mixture sequential probability ratio test (mSPRT) for a difference in means.

Johari, Pekelis, Koomen & Walsh, "Always valid inference" (2017/2022): with a
normal mixture N(0, tau²) over the effect and an estimate ``d`` whose variance
is ``V``, the mixture likelihood ratio against H0: effect = 0 is

    Λ = sqrt(V / (V + tau²)) * exp(tau² d² / (2 V (V + tau²)))

The always-valid p-value is the running minimum of ``min(1, 1/Λ)``; the
confidence sequence is the running intersection of ``d ± halfwidth``, where
``halfwidth`` solves Λ(d - θ) = 1/alpha. Either may be read after every look
without inflating the error rate. ``V`` is the plug-in Welch variance, so the
guarantee is asymptotic in the per-arm sample size.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike

from abkit.stats._common import as_sample, check_alpha, significance


def _check_tau(tau: float) -> float:
    if isinstance(tau, bool) or not isinstance(tau, int | float) or not (0 < tau < math.inf):
        raise ValueError(f"tau must be a finite positive number, got {tau!r}")
    return float(tau)


def _check_variance(variance: ArrayLike) -> np.ndarray:
    v = np.asarray(variance, dtype=np.float64)
    if not np.all(np.isfinite(v)):
        raise ValueError("variance must hold only finite values")
    if np.any(v <= 0):
        raise ValueError("variance must be positive")
    return v


def msprt_likelihood_ratio(estimate: ArrayLike, variance: ArrayLike, tau: float) -> np.ndarray:
    """Normal-mixture likelihood ratio Λ, elementwise (inputs broadcast)."""
    tau = _check_tau(tau)
    d = np.asarray(estimate, dtype=np.float64)
    if not np.all(np.isfinite(d)):
        raise ValueError("estimate must hold only finite values")
    v = _check_variance(variance)
    t2 = tau * tau
    return np.sqrt(v / (v + t2)) * np.exp(t2 * d * d / (2 * v * (v + t2)))


def msprt_halfwidth(variance: ArrayLike, tau: float, alpha: float = 0.05) -> np.ndarray:
    """Half-width of the always-valid interval at one look, elementwise."""
    tau, alpha = _check_tau(tau), check_alpha(alpha)
    v = _check_variance(variance)
    t2 = tau * tau
    return np.sqrt(v * (v + t2) / t2 * (2 * math.log(1 / alpha) + np.log((v + t2) / v)))


@dataclass(frozen=True)
class MsprtSequence:
    """Always-valid p-values and confidence sequence after each look (last axis)."""

    p_value: np.ndarray
    ci_low: np.ndarray
    ci_high: np.ndarray
    alpha: float

    @property
    def rejected(self) -> np.ndarray:
        return self.p_value < self.alpha


def msprt_sequence(
    estimates: ArrayLike, variances: ArrayLike, tau: float, alpha: float = 0.05
) -> MsprtSequence:
    """Looks run along the last axis; leading axes are independent experiments."""
    d = np.asarray(estimates, dtype=np.float64)
    v = np.asarray(variances, dtype=np.float64)
    if d.shape != v.shape or d.ndim < 1:
        raise ValueError(f"estimates and variances need the same shape, got {d.shape}, {v.shape}")
    alpha = check_alpha(alpha)
    lr = msprt_likelihood_ratio(d, v, tau)
    half = msprt_halfwidth(v, tau, alpha)
    with np.errstate(divide="ignore", over="ignore"):
        snapshot_p = np.minimum(1.0, 1.0 / lr)
    return MsprtSequence(
        p_value=np.minimum.accumulate(snapshot_p, axis=-1),
        ci_low=np.maximum.accumulate(d - half, axis=-1),
        ci_high=np.minimum.accumulate(d + half, axis=-1),
        alpha=alpha,
    )


@dataclass(frozen=True)
class MsprtResult:
    """One look: ``estimate`` is mean(treatment) - mean(control)."""

    estimate: float
    se: float
    tau: float
    likelihood_ratio: float
    p_value: float
    ci_low: float
    ci_high: float
    alpha: float

    @property
    def decision(self) -> str:
        return significance(self.p_value, self.alpha)


def msprt_test(
    control: ArrayLike, treatment: ArrayLike, tau: float, alpha: float = 0.05
) -> MsprtResult:
    """mSPRT at a single look on raw samples (Welch plug-in variance)."""
    alpha, tau = check_alpha(alpha), _check_tau(tau)
    c, t = as_sample("control", control), as_sample("treatment", treatment)
    variance = c.var(ddof=1) / c.size + t.var(ddof=1) / t.size
    if variance == 0:
        raise ValueError("both groups have zero variance; the mSPRT is undefined")
    estimate = float(t.mean() - c.mean())
    lr = float(msprt_likelihood_ratio(estimate, variance, tau))
    half = float(msprt_halfwidth(variance, tau, alpha))
    return MsprtResult(
        estimate=estimate,
        se=math.sqrt(variance),
        tau=tau,
        likelihood_ratio=lr,
        p_value=min(1.0, 1.0 / lr),
        ci_low=estimate - half,
        ci_high=estimate + half,
        alpha=alpha,
    )
