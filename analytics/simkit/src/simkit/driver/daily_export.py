"""The driver's export step: ``analytics:export`` for every UTC day of the run, then read it."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from simkit.driver.analysis import export_days
from simkit.driver.exported import EXPORT_GLOB, read_export
from simkit.driver.stack import export_day


def export_file(out_dir: Path, day: str) -> Path:
    """``exportFileName()`` in backend/src/features/analytics/services/export-row.ts."""
    return out_dir / f"events-{day}.jsonl.gz"


def export_run(
    accepted_events: Sequence[Mapping[str, Any]], out_dir: Path, env: Mapping[str, str]
) -> list[dict]:
    """Export every UTC day from the first to the last accepted event; return all rows.

    ``env`` is the backend's own environment: the export must read the database the ingest
    wrote and hash ids with the same secret. Day files already in ``out_dir`` (an earlier run
    in a reused work dir) are removed first, so only this run's export is read back. The
    backend writes a file even for a day without events, so a missing file is a failed export.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob(EXPORT_GLOB):
        stale.unlink()
    for day in export_days(accepted_events):
        export_day(day, out_dir, env)
        if not export_file(out_dir, day).is_file():
            raise RuntimeError(f"analytics:export wrote no {export_file(out_dir, day).name}")
    return read_export(out_dir)
