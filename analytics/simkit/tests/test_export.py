import json
from datetime import UTC, date, datetime
from pathlib import Path

import pyarrow.parquet as pq
import pytest

from simkit.export import PARQUET_COLUMNS, read_jsonl, to_jsonl, write_jsonl, write_parquet
from simkit.generator import simulate

START = date(2026, 11, 1)


@pytest.fixture(scope="module")
def events():
    return simulate(seed=13, users=20, days=2, start=START).events


def test_jsonl_is_canonical_one_object_per_line() -> None:
    text = to_jsonl([{"b": 1, "a": "é"}, {"c": None}])
    assert text == '{"a":"é","b":1}\n{"c":null}\n'


def test_jsonl_round_trips(tmp_path: Path, events) -> None:
    path = tmp_path / "events.jsonl"
    write_jsonl(events, path)
    assert path.read_bytes().count(b"\r") == 0
    assert read_jsonl(path) == events


def test_parquet_has_typed_envelope_columns(tmp_path: Path, events) -> None:
    path = tmp_path / "events.parquet"
    write_parquet(events, path)
    table = pq.read_table(path)
    assert table.column_names == list(PARQUET_COLUMNS)
    assert table.num_rows == len(events)
    assert str(table.schema.field("occurredAt").type) == "timestamp[ms, tz=UTC]"
    rows = table.to_pylist()
    first = events[0]
    assert rows[0]["eventId"] == first["eventId"]
    assert rows[0]["userId"] == first["userId"]
    assert rows[0]["occurredAt"] == datetime.fromisoformat(
        first["occurredAt"].replace("Z", "+00:00")
    ).astimezone(UTC)
    assert json.loads(rows[0]["properties"]) == first["properties"]


def test_parquet_keeps_anonymous_users_as_null(tmp_path: Path, events) -> None:
    path = tmp_path / "anon.parquet"
    write_parquet([{**events[0], "userId": None}], path)
    assert pq.read_table(path).to_pylist()[0]["userId"] is None


def test_parquet_refuses_quarantined_events(tmp_path: Path, events) -> None:
    bad = [*events[:3], {**events[3], "schemaVersion": 2}]
    with pytest.raises(ValueError, match="schema-valid"):
        write_parquet(bad, tmp_path / "bad.parquet")
    assert not (tmp_path / "bad.parquet").exists()
