"""The Hillstrom e-mail test (MineThatData E-Mail Analytics Challenge, 2008).

64,000 customers were split at random into thirds: a Mens e-mail, a Womens
e-mail, and no e-mail; visits, conversions and spend were tracked for two
weeks. The raw file is not committed (B2 plan: external data lives under
``D:\\data\\b2\\``); download it from ``HILLSTROM_URL``. Loading checks its
SHA-256 so every number is computed on the published file.
"""

from __future__ import annotations

import csv
import hashlib
from pathlib import Path

import numpy as np

HILLSTROM_URL = (
    "http://www.minethatdata.com/"
    "Kevin_Hillstrom_MineThatData_E-MailAnalytics_DataMiningChallenge_2008.03.20.csv"
)
HILLSTROM_SHA256 = "0e5893329d8b93cefecc571777672028290ab69865718020c78c7284f291aece"
#: Rows per arm, as Radcliffe (2008) prints them in Table 1 and the file holds them.
HILLSTROM_COUNTS = {"Mens E-Mail": 21307, "Womens E-Mail": 21387, "No E-Mail": 21306}
Columns = dict[str, np.ndarray]
_COLUMNS = ("recency", "history", "segment", "visit", "conversion", "spend")


def load_hillstrom(path: Path, expected_sha256: str | None = HILLSTROM_SHA256) -> Columns:
    """Every column as text, in file order.

    ``expected_sha256=None`` skips the checksum (only for test fixtures).
    """
    path = Path(path)
    raw = path.read_bytes()
    if expected_sha256 is not None:
        digest = hashlib.sha256(raw).hexdigest()
        if digest != expected_sha256:
            raise ValueError(
                f"{path}: sha256 {digest} is not the published Hillstrom file "
                f"({expected_sha256}); download it from {HILLSTROM_URL}"
            )
    reader = csv.reader(raw.decode("utf-8").splitlines())
    header = next(reader, [])
    missing = [c for c in _COLUMNS if c not in header]
    if missing:
        raise ValueError(f"{path}: missing Hillstrom column(s) {missing}")
    rows = [row for row in reader if row]
    columns = {name: np.array([row[i] for row in rows], dtype=str) for i, name in enumerate(header)}
    unknown = set(columns["segment"].tolist()) - set(HILLSTROM_COUNTS)
    if unknown:
        raise ValueError(f"{path}: unknown segment(s) {sorted(unknown)}")
    return columns


def two_arms(columns: Columns, treatment: str, control: str = "No E-Mail") -> Columns:
    """The rows of two segments, with a ``variant`` column of ``treatment`` / ``control``."""
    if treatment == control or not {treatment, control} <= set(HILLSTROM_COUNTS):
        raise ValueError(
            f"treatment and control must be two different segments of "
            f"{sorted(HILLSTROM_COUNTS)}, got {treatment!r} and {control!r}"
        )
    segment = columns["segment"]
    keep = (segment == treatment) | (segment == control)
    arms = {name: values[keep] for name, values in columns.items()}
    arms["variant"] = np.where(segment[keep] == treatment, "treatment", "control")
    return arms
