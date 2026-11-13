"""Small files in the raw Criteo Uplift v2.1 layout, for tests that must not need the real file."""

from __future__ import annotations

import gzip
import os
from pathlib import Path

import numpy as np

CRITEO_HEADER = "f0,f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,treatment,conversion,visit,exposure"
#: The raw Criteo file is not in git (B2 plan: external data under D:\data\b2\, CC BY-NC-SA).
CRITEO_RAW = Path(
    os.environ.get("ABKIT_CRITEO_CSV", "D:/data/b2/criteo/criteo-research-uplift-v2.1.csv.gz")
)


def criteo_like_rows(n: int = 2000, seed: int = 0) -> np.ndarray:
    """``n`` rows of the 16 Criteo columns. The visit lift grows with f0; only treated users
    can be exposed, more often when f1 is high."""
    rng = np.random.default_rng(seed)
    features = rng.normal(size=(n, 12))
    treatment = (rng.random(n) < 0.85).astype(float)
    logit = -3.0 + 0.5 * features[:, 2] + treatment * (0.6 + 0.8 * features[:, 0])
    visit = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(float)
    conversion = visit * (rng.random(n) < 0.2)
    exposure = treatment * (rng.random(n) < 1 / (1 + np.exp(-(-1.0 + features[:, 1]))))
    return np.column_stack([features, treatment, conversion, visit, exposure])


def write_criteo_like(path: Path, n: int = 2000, seed: int = 0) -> Path:
    """Write ``criteo_like_rows`` as CSV, gzipped when ``path`` ends in ``.gz``."""
    rows = criteo_like_rows(n, seed)
    lines = [CRITEO_HEADER]
    for row in rows:
        cells = [repr(float(v)) for v in row[:12]] + [str(int(v)) for v in row[12:]]
        lines.append(",".join(cells))
    text = "\n".join(lines) + "\n"
    if str(path).endswith(".gz"):
        with gzip.open(path, "wt", encoding="utf-8", newline="") as fh:
            fh.write(text)
    else:
        Path(path).write_text(text, encoding="utf-8")
    return Path(path)
