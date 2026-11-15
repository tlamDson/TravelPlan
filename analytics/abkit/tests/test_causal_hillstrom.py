"""Hillstrom loader and the covariate-driven biased sampler for M6 (B2 plan, PR 17).

The real file lives outside the repo (``D:\\data\\b2\\hillstrom``); these tests write a small
file with the same header and value spellings.
"""

from pathlib import Path

import numpy as np
import pytest

from abkit.causal.hillstrom import (
    HILLSTROM_COVARIATES,
    biased_sample,
    load_hillstrom,
    selection_score,
)

HEADER = (
    "recency,history_segment,history,mens,womens,zip_code,newbie,channel,segment,"
    "visit,conversion,spend\n"
)
ROWS = [
    "10,2) $100 - $200,142.44,1,0,Surburban,0,Phone,Womens E-Mail,0,0,0",
    "6,3) $200 - $350,329.08,1,1,Rural,1,Web,No E-Mail,0,0,0",
    "7,2) $100 - $200,180.65,0,1,Surburban,1,Web,Womens E-Mail,1,0,0",
    "9,5) $500 - $750,675.83,1,0,Rural,1,Web,Mens E-Mail,0,0,0",
    "2,1) $0 - $100,45.34,1,0,Urban,0,Multichannel,No E-Mail,1,1,29.99",
]


def _write(tmp_path: Path, rows=ROWS) -> Path:
    path = tmp_path / "hillstrom.csv"
    path.write_text(HEADER + "\n".join(rows) + "\n", encoding="utf-8")
    return path


def test_loader_keeps_the_chosen_arm_and_the_no_email_arm(tmp_path: Path) -> None:
    data = load_hillstrom(_write(tmp_path))
    np.testing.assert_array_equal(data["treatment"], [1, 0, 1, 0])
    np.testing.assert_array_equal(data["outcome"], [0, 0, 1, 1])
    assert set(HILLSTROM_COVARIATES) <= set(data)
    np.testing.assert_allclose(data["log_history"], np.log1p([142.44, 329.08, 180.65, 45.34]))
    np.testing.assert_array_equal(data["channel_web"], [0, 1, 1, 0])
    np.testing.assert_array_equal(data["channel_multichannel"], [0, 0, 0, 1])
    np.testing.assert_array_equal(data["zip_urban"], [0, 0, 0, 1])
    np.testing.assert_array_equal(data["zip_rural"], [0, 1, 0, 0])


def test_loader_can_pick_the_mens_arm_and_another_outcome(tmp_path: Path) -> None:
    data = load_hillstrom(_write(tmp_path), arm="Mens E-Mail", outcome="spend")
    np.testing.assert_array_equal(data["treatment"], [0, 1, 0])
    np.testing.assert_allclose(data["outcome"], [0.0, 0.0, 29.99])


def test_loader_rejects_unknown_values_and_columns(tmp_path: Path) -> None:
    bad = [ROWS[0].replace("Phone", "Fax")]
    with pytest.raises(ValueError, match="Fax"):
        load_hillstrom(_write(tmp_path, bad))
    with pytest.raises(ValueError, match="arm"):
        load_hillstrom(_write(tmp_path), arm="No E-Mail")
    with pytest.raises(ValueError, match="outcome"):
        load_hillstrom(_write(tmp_path), outcome="history")


def _synthetic(n: int = 40_000, seed: int = 3) -> dict[str, np.ndarray]:
    """Hillstrom-shaped columns with a randomized 50/50 treatment."""
    rng = np.random.default_rng(seed)
    data = {name: rng.integers(0, 2, n).astype(float) for name in HILLSTROM_COVARIATES}
    data["recency"] = rng.integers(1, 13, n).astype(float)
    data["log_history"] = np.log1p(rng.gamma(2.0, 120.0, n))
    data["treatment"] = rng.integers(0, 2, n).astype(float)
    data["outcome"] = (rng.random(n) < 0.1).astype(float)
    return data


def test_selection_score_is_standardized() -> None:
    z = selection_score(_synthetic())
    assert z.mean() == pytest.approx(0.0, abs=1e-12)
    assert z.std() == pytest.approx(1.0, rel=1e-12)


def test_biased_sample_is_seeded_and_keeps_about_half_of_every_covariate_cell() -> None:
    data = _synthetic()
    keep = biased_sample(data, np.random.default_rng(5), strength=1.0)
    again = biased_sample(data, np.random.default_rng(5), strength=1.0)
    np.testing.assert_array_equal(keep, again)
    assert keep.dtype == bool
    z = selection_score(data)
    for cell in (z < -1, (z >= -1) & (z < 1), z >= 1):
        assert keep[cell].mean() == pytest.approx(0.5, abs=0.03)


def test_biased_sample_makes_treatment_depend_on_the_score() -> None:
    data = _synthetic()
    keep = biased_sample(data, np.random.default_rng(5), strength=1.5)
    z, t = selection_score(data)[keep], data["treatment"][keep]
    assert t[z > 1].mean() > 0.8
    assert t[z < -1].mean() < 0.2


def test_strength_zero_keeps_a_random_half() -> None:
    data = _synthetic()
    keep = biased_sample(data, np.random.default_rng(5), strength=0.0)
    z, t = selection_score(data)[keep], data["treatment"][keep]
    assert t[z > 1].mean() == pytest.approx(0.5, abs=0.03)


def test_negative_strength_is_rejected() -> None:
    with pytest.raises(ValueError, match="strength"):
        biased_sample(_synthetic(100), np.random.default_rng(0), strength=-1.0)
