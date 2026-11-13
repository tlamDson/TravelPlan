"""Standard errors of IPW and AIPW, checked independently of ``abkit.causal.estimators``.

Two checks that do not reuse the engine's formulas:

* Textbook influence functions written out here (Glynn & Quinn 2010 for the ATE; the
  normalized doubly robust ATT), on the 10-unit saturated example. With saturated models the
  Hajek normalizers equal the sample sizes, so the engine must match these exactly. The
  values are also pinned as literals.
* Monte Carlo: with the true nuisances, the mean reported SE must match the empirical
  standard deviation of the estimates across replications.
"""

import math

import numpy as np
import pytest
from test_causal_estimators import MU0, MU1, E, T, Y

from abkit.causal import aipw, ipw

N = Y.size


def test_aipw_ate_se_is_the_textbook_influence_function_se() -> None:
    psi = MU1 - MU0 + T * (Y - MU1) / E - (1 - T) * (Y - MU0) / (1 - E)
    textbook = math.sqrt(float(np.sum((psi - psi.mean()) ** 2))) / N
    result = aipw(Y, T, E, MU0, MU1, estimand="ate")
    assert result.estimate == pytest.approx(psi.mean(), rel=1e-12)
    assert result.se == pytest.approx(textbook, rel=1e-12)
    assert result.se == pytest.approx(0.7434902674398487, rel=1e-12)


def test_aipw_att_se_is_the_textbook_influence_function_se() -> None:
    p, odds, resid = T.mean(), E / (1 - E), Y - MU0
    tau = (np.sum(T * resid) - np.sum((1 - T) * odds * resid)) / T.sum()
    psi = (T * (resid - tau) - (1 - T) * odds * resid) / p
    textbook = math.sqrt(float(np.sum(psi**2))) / N
    result = aipw(Y, T, E, MU0, estimand="att")
    assert result.estimate == pytest.approx(tau, rel=1e-12)
    assert result.se == pytest.approx(textbook, rel=1e-12)
    assert result.se == pytest.approx(0.8145891943523162, rel=1e-12)


def test_ipw_ate_se_is_the_textbook_hajek_se() -> None:
    """Saturated propensity: sum(T/e) = sum((1-T)/(1-e)) = n, so Hajek = Horvitz-Thompson."""
    mu1 = np.sum(T * Y / E) / N
    mu0 = np.sum((1 - T) * Y / (1 - E)) / N
    psi = T * (Y - mu1) / E - (1 - T) * (Y - mu0) / (1 - E)
    result = ipw(Y, T, E, estimand="ate")
    assert result.se == pytest.approx(math.sqrt(float(np.sum(psi**2))) / N, rel=1e-12)


def _replicate(n: int, seed: int):
    rng = np.random.default_rng(seed)
    x = rng.normal(size=n)
    e = 1 / (1 + np.exp(-(0.3 + 0.8 * x)))
    t = (rng.random(n) < e).astype(float)
    effect = 2.0 + 0.5 * x
    y = 1.0 + 2.0 * x + effect * t + rng.normal(scale=1.5, size=n)
    return y, t, e, 1.0 + 2.0 * x, 3.0 + 2.5 * x


@pytest.mark.parametrize(
    ("label", "estimator"),
    [
        ("aipw-ate", lambda y, t, e, m0, m1: aipw(y, t, e, m0, m1, estimand="ate")),
        ("aipw-att", lambda y, t, e, m0, m1: aipw(y, t, e, m0, estimand="att")),
        ("ipw-ate", lambda y, t, e, m0, m1: ipw(y, t, e, estimand="ate")),
        ("ipw-att", lambda y, t, e, m0, m1: ipw(y, t, e, estimand="att")),
    ],
)
def test_reported_se_matches_the_monte_carlo_spread(label: str, estimator) -> None:
    results = [estimator(*_replicate(2_000, seed)) for seed in range(400)]
    empirical = float(np.std([r.estimate for r in results], ddof=1))
    reported = float(np.mean([r.se for r in results]))
    # 400 replications put the SD itself within about +/-7% (2 standard errors).
    assert reported == pytest.approx(empirical, rel=0.12), label
