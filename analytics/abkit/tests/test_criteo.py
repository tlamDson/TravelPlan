"""Reading the Criteo Uplift v2.1 file in chunks, counting its arms, drawing the 10% sample."""

import hashlib
from pathlib import Path

import numpy as np
import pytest
from criteo_fixtures import CRITEO_RAW, criteo_like_rows, write_criteo_like

from abkit.criteo import (
    CRITEO_BYTES,
    CRITEO_COLUMNS,
    CRITEO_MIRROR_URL,
    CRITEO_PAGE_URL,
    CRITEO_SHA256,
    CRITEO_URL,
    CriteoSample,
    arm_counts,
    draw_sample,
    file_sha256,
    iter_chunks,
    load_sample,
    save_sample,
)


def test_constants_pin_the_published_file() -> None:
    assert CRITEO_URL == "http://go.criteo.net/criteo-research-uplift-v2.1.csv.gz"
    assert CRITEO_MIRROR_URL.startswith("https://huggingface.co/datasets/criteo/")
    assert CRITEO_PAGE_URL == "https://ailab.criteo.com/criteo-uplift-prediction-dataset/"
    assert len(CRITEO_SHA256) == 64
    assert CRITEO_BYTES == 311_422_618  # "Size: 297M (compressed)" on the Criteo page, in MiB
    expected_columns = (*(f"f{i}" for i in range(12)), "treatment", "conversion", "visit")
    assert (*expected_columns, "exposure") == CRITEO_COLUMNS


def test_file_sha256_hashes_the_bytes(tmp_path: Path) -> None:
    path = write_criteo_like(tmp_path / "c.csv.gz", n=10)
    assert file_sha256(path) == hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.mark.parametrize("name", ["c.csv", "c.csv.gz"])
def test_iter_chunks_reads_plain_and_gzipped_files_in_chunks(tmp_path: Path, name: str) -> None:
    path = write_criteo_like(tmp_path / name, n=25)
    chunks = list(iter_chunks(path, chunk_rows=10, expected_sha256=None))
    assert [c.shape for c in chunks] == [(10, 16), (10, 16), (5, 16)]
    np.testing.assert_allclose(np.concatenate(chunks), criteo_like_rows(25))


def test_iter_chunks_checks_the_checksum_by_default(tmp_path: Path) -> None:
    path = write_criteo_like(tmp_path / "c.csv.gz", n=10)
    with pytest.raises(ValueError, match="sha256"):
        list(iter_chunks(path))
    digest = file_sha256(path)
    assert sum(len(c) for c in iter_chunks(path, expected_sha256=digest)) == 10


def test_iter_chunks_rejects_another_header(tmp_path: Path) -> None:
    path = tmp_path / "other.csv"
    path.write_text("a,b\n1,2\n", encoding="utf-8")
    with pytest.raises(ValueError, match="header"):
        list(iter_chunks(path, expected_sha256=None))


def test_iter_chunks_rejects_a_label_that_is_not_binary(tmp_path: Path) -> None:
    path = write_criteo_like(tmp_path / "c.csv", n=5)
    lines = path.read_text(encoding="utf-8").splitlines()
    lines[3] = lines[3].rsplit(",", 1)[0] + ",2"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="exposure"):
        list(iter_chunks(path, expected_sha256=None))


def test_arm_counts_sums_each_label_by_arm(tmp_path: Path) -> None:
    rows = criteo_like_rows(300, seed=3)
    path = write_criteo_like(tmp_path / "c.csv.gz", n=300, seed=3)
    counts = arm_counts(path, expected_sha256=None, chunk_rows=64)
    for variant, flag in (("control", 0), ("treatment", 1)):
        arm = rows[rows[:, 12] == flag]
        assert counts[variant] == {
            "n": len(arm),
            "conversion": int(arm[:, 13].sum()),
            "visit": int(arm[:, 14].sum()),
            "exposure": int(arm[:, 15].sum()),
        }
    assert counts["control"]["exposure"] == 0


def test_draw_sample_keeps_a_seeded_fraction_independent_of_chunk_size(tmp_path: Path) -> None:
    path = write_criteo_like(tmp_path / "c.csv.gz", n=4000, seed=1)
    a = draw_sample(path, fraction=0.1, seed=7, expected_sha256=None, chunk_rows=333)
    b = draw_sample(path, fraction=0.1, seed=7, expected_sha256=None, chunk_rows=4000)
    c = draw_sample(path, fraction=0.1, seed=8, expected_sha256=None)
    assert 300 < len(a) < 500
    np.testing.assert_array_equal(a.features, b.features)
    np.testing.assert_array_equal(a.visit, b.visit)
    assert len(c) != len(a) or not np.array_equal(c.features, a.features)
    keep = np.random.default_rng(7).random(4000) < 0.1  # one uniform draw per row, file order
    rows = criteo_like_rows(4000, seed=1)[keep]
    np.testing.assert_allclose(a.features, rows[:, :12], rtol=1e-6)
    np.testing.assert_array_equal(a.treatment, rows[:, 12])
    assert a.features.dtype == np.float32 and a.treatment.dtype == np.int8
    assert (a.fraction, a.seed, a.source_rows) == (0.1, 7, 4000)


def test_draw_sample_rejects_a_fraction_outside_zero_one(tmp_path: Path) -> None:
    path = write_criteo_like(tmp_path / "c.csv", n=10)
    for fraction in (0.0, 1.5):
        with pytest.raises(ValueError, match="fraction"):
            draw_sample(path, fraction=fraction, seed=0, expected_sha256=None)


def test_sample_round_trips_through_npz(tmp_path: Path) -> None:
    path = write_criteo_like(tmp_path / "c.csv.gz", n=500)
    sample = draw_sample(path, fraction=0.5, seed=2, expected_sha256=None)
    out = save_sample(sample, tmp_path / "s.npz")
    loaded = load_sample(out)
    assert isinstance(loaded, CriteoSample)
    assert len(loaded) == len(sample)
    for name in ("features", "treatment", "conversion", "visit", "exposure"):
        np.testing.assert_array_equal(getattr(loaded, name), getattr(sample, name))
    assert (loaded.fraction, loaded.seed, loaded.source_rows, loaded.source_sha256) == (
        sample.fraction,
        sample.seed,
        sample.source_rows,
        sample.source_sha256,
    )


@pytest.mark.skipif(not CRITEO_RAW.is_file(), reason="raw Criteo CSV not on this machine")
def test_the_real_file_has_the_published_checksum_and_size() -> None:
    assert CRITEO_RAW.stat().st_size == CRITEO_BYTES
    assert file_sha256(CRITEO_RAW) == CRITEO_SHA256
