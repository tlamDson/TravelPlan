"""Read the backend's daily export (``npm run analytics:export -w backend``)."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

#: ``exportFileName()`` in backend/src/features/analytics/services/export-row.ts.
EXPORT_GLOB = "events-????-??-??.jsonl.gz"


def read_export(out_dir: str | Path) -> list[dict]:
    """Every row of every ``events-<day>.jsonl.gz`` in ``out_dir``, days in order."""
    rows: list[dict] = []
    for path in sorted(Path(out_dir).glob(EXPORT_GLOB)):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            rows.extend(json.loads(line) for line in f if line.strip())
    return rows
