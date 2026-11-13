"""The Criteo Uplift Prediction Dataset v2.1 (un-biased): chunked reading, arm counts, a sample.

Diemert et al., "A Large Scale Benchmark for Individual Treatment Effect Prediction and
Uplift Modeling" (2021). One row per user: 12 anonymized features, ``treatment`` (85%
treated), and the 0/1 labels ``conversion``, ``visit`` and ``exposure`` (only treated users
can be exposed). The license is CC BY-NC-SA 4.0: the file stays under ``D:\\data\\b2\\``
and is never committed (B2 plan).
"""

from __future__ import annotations

import gzip
import hashlib
import io
import itertools
import os
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import numpy as np

CRITEO_URL = "http://go.criteo.net/criteo-research-uplift-v2.1.csv.gz"
#: Criteo's own Hugging Face copy, byte-identical (same sha256); the link above redirects
#: to an Azure blob host that some networks cannot resolve.
CRITEO_MIRROR_URL = (
    "https://huggingface.co/datasets/criteo/criteo-uplift/resolve/main/"
    "criteo-research-uplift-v2.1.csv.gz"
)
CRITEO_PAGE_URL = "https://ailab.criteo.com/criteo-uplift-prediction-dataset/"
CRITEO_PAPER_URL = "https://arxiv.org/abs/2111.10106"
#: Neither source publishes a checksum; this is the file as downloaded on 2026-11-13, equal
#: to the sha256 Hugging Face reports for it.
CRITEO_SHA256 = "2716e1bf0fd157a93b5bf86924d9088419dfbac2022c6cd90030220634f616dc"
CRITEO_BYTES = 311_422_618
FEATURES: tuple[str, ...] = tuple(f"f{i}" for i in range(12))
LABELS: tuple[str, ...] = ("treatment", "conversion", "visit", "exposure")
CRITEO_COLUMNS: tuple[str, ...] = (*FEATURES, *LABELS)
DEFAULT_RAW = Path(
    os.environ.get("ABKIT_CRITEO_CSV", "D:/data/b2/criteo/criteo-research-uplift-v2.1.csv.gz")
)
DEFAULT_CHUNK_ROWS = 1_000_000


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _check_sha256(path: Path, expected: str | None) -> None:
    if expected is not None and (actual := file_sha256(path)) != expected:
        raise ValueError(f"{path}: sha256 {actual} is not the published file's {expected}")


def _open_text(path: Path) -> io.TextIOBase:
    if str(path).endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", newline="")
    return Path(path).open(encoding="utf-8", newline="")


def iter_chunks(
    path: Path,
    chunk_rows: int = DEFAULT_CHUNK_ROWS,
    expected_sha256: str | None = CRITEO_SHA256,
) -> Iterator[np.ndarray]:
    """Rows of the file as float64 arrays of at most ``chunk_rows`` x 16, in file order.

    The checksum is checked first (pass ``None`` to skip it), then the header, then that
    every label is 0 or 1.
    """
    if chunk_rows < 1:
        raise ValueError(f"chunk_rows must be >= 1, got {chunk_rows}")
    path = Path(path)
    _check_sha256(path, expected_sha256)
    with _open_text(path) as fh:
        header = tuple(fh.readline().strip().split(","))
        if header != CRITEO_COLUMNS:
            raise ValueError(f"{path}: header {list(header)} is not {list(CRITEO_COLUMNS)}")
        while lines := list(itertools.islice(fh, chunk_rows)):
            chunk = np.loadtxt(lines, delimiter=",", dtype=np.float64, ndmin=2)
            for j, name in enumerate(LABELS, start=len(FEATURES)):
                if not np.isin(chunk[:, j], (0.0, 1.0)).all():
                    raise ValueError(f"{path}: column {name} has a value other than 0/1")
            yield chunk


def arm_counts(
    path: Path,
    expected_sha256: str | None = CRITEO_SHA256,
    chunk_rows: int = DEFAULT_CHUNK_ROWS,
) -> dict[str, dict[str, int]]:
    """Users, conversions, visits and exposures per arm (``control`` / ``treatment``)."""
    totals = np.zeros((2, 4), dtype=np.int64)  # arm x (n, conversion, visit, exposure)
    for chunk in iter_chunks(path, chunk_rows, expected_sha256):
        labels = chunk[:, len(FEATURES) :].astype(np.int64)
        for arm in (0, 1):
            rows = labels[labels[:, 0] == arm]
            totals[arm, 0] += len(rows)
            totals[arm, 1:] += rows[:, 1:].sum(axis=0)
    keys = ("n", "conversion", "visit", "exposure")
    return {
        variant: dict(zip(keys, map(int, totals[arm]), strict=True))
        for arm, variant in enumerate(("control", "treatment"))
    }


@dataclass(frozen=True, eq=False)
class CriteoSample:
    """A seeded row sample: features as float32, the four labels as int8."""

    features: np.ndarray
    treatment: np.ndarray
    conversion: np.ndarray
    visit: np.ndarray
    exposure: np.ndarray
    fraction: float
    seed: int
    source_rows: int
    source_sha256: str

    def __len__(self) -> int:
        return len(self.treatment)


def draw_sample(
    path: Path,
    fraction: float = 0.1,
    seed: int = 20,
    expected_sha256: str | None = CRITEO_SHA256,
    chunk_rows: int = DEFAULT_CHUNK_ROWS,
) -> CriteoSample:
    """Keep each row when its uniform draw is below ``fraction``: one draw per row, in file
    order, from ``default_rng(seed)``, so the sample does not depend on ``chunk_rows``."""
    if not 0.0 < fraction <= 1.0:
        raise ValueError(f"fraction must be in (0, 1], got {fraction}")
    rng = np.random.default_rng(seed)
    kept, source_rows = [], 0
    for chunk in iter_chunks(path, chunk_rows, expected_sha256):
        source_rows += len(chunk)
        kept.append(chunk[rng.random(len(chunk)) < fraction])
    rows = np.concatenate(kept)
    labels = {name: rows[:, j].astype(np.int8) for j, name in enumerate(LABELS, len(FEATURES))}
    return CriteoSample(
        features=rows[:, : len(FEATURES)].astype(np.float32),
        **labels,
        fraction=fraction,
        seed=seed,
        source_rows=source_rows,
        source_sha256=file_sha256(path) if expected_sha256 is None else expected_sha256,
    )


_ARRAYS = ("features", *LABELS)


def save_sample(sample: CriteoSample, path: Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    meta = {
        "fraction": np.float64(sample.fraction),
        "seed": np.int64(sample.seed),
        "source_rows": np.int64(sample.source_rows),
        "source_sha256": np.str_(sample.source_sha256),
    }
    with path.open("wb") as fh:
        np.savez_compressed(fh, **{n: getattr(sample, n) for n in _ARRAYS}, **meta)
    return path


def load_sample(path: Path) -> CriteoSample:
    with np.load(Path(path), allow_pickle=False) as npz:
        return CriteoSample(
            **{n: npz[n] for n in _ARRAYS},
            fraction=float(npz["fraction"]),
            seed=int(npz["seed"]),
            source_rows=int(npz["source_rows"]),
            source_sha256=str(npz["source_sha256"]),
        )
