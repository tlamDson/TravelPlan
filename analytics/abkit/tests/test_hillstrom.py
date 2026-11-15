"""Loading the Hillstrom (MineThatData 2008) e-mail test and picking two of its arms."""

import hashlib
from pathlib import Path

import numpy as np
import pytest
from conftest import HILLSTROM_RAW, write_hillstrom_like

from abkit.hillstrom import (
    HILLSTROM_COUNTS,
    HILLSTROM_SHA256,
    HILLSTROM_URL,
    load_hillstrom,
    two_arms,
)


def test_constants_pin_the_published_file() -> None:
    assert HILLSTROM_URL.startswith("http://www.minethatdata.com/")
    assert HILLSTROM_URL.endswith(".csv")
    assert len(HILLSTROM_SHA256) == 64
    # Radcliffe (2008), Table 1: data volumes per arm.
    assert HILLSTROM_COUNTS == {"Mens E-Mail": 21307, "Womens E-Mail": 21387, "No E-Mail": 21306}


def test_load_returns_text_columns_and_checks_the_checksum(tmp_path: Path) -> None:
    path = write_hillstrom_like(tmp_path / "h.csv", n=30)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    columns = load_hillstrom(path, expected_sha256=digest)
    assert columns["segment"].shape == (30,)
    assert columns["visit"].dtype.kind == "U"
    assert set(columns) >= {"segment", "visit", "conversion", "spend", "recency", "history"}
    with pytest.raises(ValueError, match="sha256"):
        load_hillstrom(path)  # the default is the published file's checksum
    assert load_hillstrom(path, expected_sha256=None)["segment"].size == 30


def test_load_rejects_a_file_without_the_hillstrom_columns(tmp_path: Path) -> None:
    path = tmp_path / "other.csv"
    path.write_text("a,b\n1,2\n", encoding="utf-8")
    with pytest.raises(ValueError, match="segment"):
        load_hillstrom(path, expected_sha256=None)


def test_load_rejects_unknown_segments(tmp_path: Path) -> None:
    path = write_hillstrom_like(tmp_path / "h.csv", n=6)
    path.write_text(path.read_text().replace("Mens E-Mail", "Kids E-Mail"), encoding="utf-8")
    with pytest.raises(ValueError, match="Kids E-Mail"):
        load_hillstrom(path, expected_sha256=None)


def test_two_arms_relabels_control_and_treatment_and_drops_the_third(tmp_path: Path) -> None:
    columns = load_hillstrom(write_hillstrom_like(tmp_path / "h.csv", n=30), expected_sha256=None)
    arms = two_arms(columns, treatment="Mens E-Mail", control="No E-Mail")
    assert arms["variant"].tolist().count("treatment") == 10
    assert arms["variant"].tolist().count("control") == 10
    assert set(arms["variant"].tolist()) == {"control", "treatment"}
    kept = np.isin(columns["segment"], ["Mens E-Mail", "No E-Mail"])
    assert arms["spend"].tolist() == columns["spend"][kept].tolist()  # row order is kept
    with pytest.raises(ValueError, match="segment"):
        two_arms(columns, treatment="Mens E-Mail", control="Mens E-Mail")
    with pytest.raises(ValueError, match="segment"):
        two_arms(columns, treatment="Kids", control="No E-Mail")


@pytest.mark.skipif(not HILLSTROM_RAW.is_file(), reason="raw Hillstrom CSV not on this machine")
def test_the_real_file_has_the_published_arm_sizes() -> None:
    columns = load_hillstrom(HILLSTROM_RAW)
    segments, counts = np.unique(columns["segment"], return_counts=True)
    assert dict(zip(segments.tolist(), counts.tolist(), strict=True)) == HILLSTROM_COUNTS
