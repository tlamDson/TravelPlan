"""Hillstrom e-mail RCT (MineThatData, 2008) and a covariate-driven biased sampler for M6.

The file stays outside the repo (B2 plan: ``D:\\data\\b2\\hillstrom\\hillstrom.csv``), from
http://www.minethatdata.com/Kevin_Hillstrom_MineThatData_E-MailAnalytics_DataMiningChallenge_2008.03.20.csv

``biased_sample`` turns the randomized arms into an observational sample: a unit with
selection score ``z`` is kept with probability ``sigmoid(s*z)`` if treated and
``sigmoid(-s*z)`` if not. With two equal arms, P(kept | X) = 1/2 for every X, so the kept
sample has the population's covariate mix and its ATE is the RCT's; but within it
logit P(T=1 | X) = const + s*z, linear in the covariates, so a logistic propensity on
``HILLSTROM_COVARIATES`` is correctly specified and naive is biased.
"""

from __future__ import annotations

import csv
from pathlib import Path

import numpy as np

CONTROL_ARM = "No E-Mail"
ARMS = ("Womens E-Mail", "Mens E-Mail")
OUTCOMES = ("visit", "conversion", "spend")
#: Model covariates (baselines: channel Phone, zip_code Surburban, the file's spelling).
HILLSTROM_COVARIATES = (
    "recency",
    "log_history",
    "mens",
    "womens",
    "newbie",
    "channel_web",
    "channel_multichannel",
    "zip_urban",
    "zip_rural",
)
#: Selection score weights on standardized covariates: recent, high-spending, returning
#: customers who bought womens' items get the e-mail more often. All raise ``visit``.
SELECTION_WEIGHTS = {"recency": -1.0, "log_history": 1.0, "newbie": -1.0, "womens": 1.0}
_CHANNELS = {"Phone", "Web", "Multichannel"}
_ZIPS = {"Surburban", "Urban", "Rural"}


def _check(value: str, allowed: set[str], column: str, line: int) -> str:
    if value not in allowed:
        raise ValueError(f"line {line}: unknown {column} {value!r}; expected {sorted(allowed)}")
    return value


def load_hillstrom(
    path: Path, arm: str = "Womens E-Mail", outcome: str = "visit"
) -> dict[str, np.ndarray]:
    """``treatment`` (1 = ``arm``, 0 = no e-mail), ``outcome`` and the model covariates.

    Rows of the third arm are dropped.
    """
    if arm not in ARMS:
        raise ValueError(f"arm must be one of {ARMS}, got {arm!r}")
    if outcome not in OUTCOMES:
        raise ValueError(f"outcome must be one of {OUTCOMES}, got {outcome!r}")
    rows: dict[str, list[float]] = {name: [] for name in ("treatment", "outcome", "history")}
    rows.update({name: [] for name in HILLSTROM_COVARIATES if name != "log_history"})
    with Path(path).open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for record in reader:
            line = reader.line_num
            segment = _check(record["segment"], {CONTROL_ARM, *ARMS}, "segment", line)
            if segment not in (arm, CONTROL_ARM):
                continue
            channel = _check(record["channel"], _CHANNELS, "channel", line)
            zip_code = _check(record["zip_code"], _ZIPS, "zip_code", line)
            rows["treatment"].append(float(segment == arm))
            rows["outcome"].append(float(record[outcome]))
            for name in ("recency", "history", "mens", "womens", "newbie"):
                rows[name].append(float(record[name]))
            rows["channel_web"].append(float(channel == "Web"))
            rows["channel_multichannel"].append(float(channel == "Multichannel"))
            rows["zip_urban"].append(float(zip_code == "Urban"))
            rows["zip_rural"].append(float(zip_code == "Rural"))
    data = {name: np.asarray(values, dtype=np.float64) for name, values in rows.items()}
    data["log_history"] = np.log1p(data.pop("history"))
    return data


def _standardize(values: np.ndarray) -> np.ndarray:
    sd = values.std()
    if sd == 0:
        raise ValueError("a selection covariate is constant")
    return (values - values.mean()) / sd


def selection_score(data: dict[str, np.ndarray]) -> np.ndarray:
    """Standardized weighted sum of standardized ``SELECTION_WEIGHTS`` covariates."""
    raw = sum(w * _standardize(data[name]) for name, w in SELECTION_WEIGHTS.items())
    return _standardize(raw)


def biased_sample(
    data: dict[str, np.ndarray], rng: np.random.Generator, strength: float = 1.0
) -> np.ndarray:
    """Boolean mask of kept rows; ``strength`` 0 keeps a random half with no confounding."""
    if not strength >= 0:
        raise ValueError(f"strength must be >= 0, got {strength!r}")
    z = selection_score(data)
    sign = np.where(data["treatment"] == 1, 1.0, -1.0)
    keep_probability = 1 / (1 + np.exp(-strength * sign * z))
    return rng.random(z.size) < keep_probability
