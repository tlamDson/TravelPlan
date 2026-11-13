"""Write SIMULATED events as canonical JSONL (the wire shape) or Parquet (a typed table)."""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path

from simkit._common import parse_ts
from simkit.catalog import Catalog, load_catalog

PARQUET_COLUMNS = (
    "eventId",
    "schemaVersion",
    "occurredAt",
    "sessionId",
    "userId",
    "source",
    "name",
    "properties",  # canonical JSON text: the shape differs per event name
)


def _canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def to_jsonl(events: Iterable[Mapping]) -> str:
    """One JSON object per line, sorted keys, no spaces, UTF-8; ends with a newline."""
    return "".join(_canonical(e) + "\n" for e in events)


def write_jsonl(events: Iterable[Mapping], path: str | Path) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(to_jsonl(events))


def read_jsonl(path: str | Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def write_parquet(
    events: Sequence[Mapping], path: str | Path, catalog: Catalog | None = None
) -> None:
    """Typed Parquet table of schema-valid events; faulted streams belong in JSONL.

    Needs the ``parquet`` extra (``pyarrow``).
    """
    catalog = catalog or load_catalog()
    invalid = sum(catalog.classify(e) is not None for e in events)
    if invalid:
        raise ValueError(f"Parquet holds schema-valid events only; {invalid} would be quarantined")
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError as exc:  # pragma: no cover - depends on the install
        raise RuntimeError('write_parquet needs pyarrow: pip install -e ".[parquet]"') from exc

    schema = pa.schema(
        [
            ("eventId", pa.string()),
            ("schemaVersion", pa.int32()),
            ("occurredAt", pa.timestamp("ms", tz="UTC")),
            ("sessionId", pa.string()),
            ("userId", pa.string()),
            ("source", pa.string()),
            ("name", pa.string()),
            ("properties", pa.string()),
        ]
    )
    columns = {name: [] for name in PARQUET_COLUMNS}
    for event in events:
        for name in PARQUET_COLUMNS:
            value = event[name]
            if name == "occurredAt":
                value = parse_ts(value)
            elif name == "properties":
                value = _canonical(value)
            columns[name].append(value)
    pq.write_table(pa.table(columns, schema=schema), path)
