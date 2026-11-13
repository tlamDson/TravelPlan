"""Golden case format and loader (``analytics/golden/README.md`` documents it).

A dataset is ``<root>/<group>/<case>/`` directories, each with a ``truth.json``
and, unless the case is purely parametric, a ``data.csv``. Every field of
``truth.json`` is validated here so a typo fails loudly instead of passing.
"""

from __future__ import annotations

import csv
import json
import math
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

SCHEMA_VERSION = 1
TRUTH_FILE = "truth.json"

#: Methods a case may name; ``analytics/golden/README.md`` documents each one.
KNOWN_METHODS: frozenset[str] = frozenset(
    {
        "welch_ttest",
        "delta_ratio",
        "cuped",
        "srm_chisquare",
        "power_ttest_ind",
        "sample_size_ttest_ind",
        "mde_ttest_ind",
        "sample_size_proportions",
        "bh_fdr",
        "readout",
        "naive_diff",
        "ipw",
        "aipw",
    }
)

_SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
_REQUIRED = ("schema_version", "id", "method", "description", "params", "expected", "source")
_OPTIONAL = ("data", "decision", "tolerance")
_SOURCE_REQUIRED = ("tool", "version", "call")

Value = float | bool | list[float] | list[bool]


class GoldenFormatError(ValueError):
    """A golden case or dataset does not follow the format."""


@dataclass(frozen=True)
class Tolerance:
    abs: float
    rel: float

    def allows(self, expected: float, actual: float) -> bool:
        return abs(actual - expected) <= self.abs + self.rel * abs(expected)


@dataclass(frozen=True)
class GoldenCase:
    id: str
    path: Path
    method: str
    description: str
    params: dict[str, Any]
    expected: dict[str, Value]
    decision: str | None
    tolerance: dict[str, Tolerance]
    source: dict[str, Any]
    data_file: str | None = field(default=None)

    @property
    def group(self) -> str:
        return self.id.split("/")[0]

    @property
    def name(self) -> str:
        return self.id.split("/")[1]

    def tolerance_for(self, key: str) -> Tolerance:
        return self.tolerance.get(key, self.tolerance["default"])

    def read_data(self) -> dict[str, np.ndarray] | None:
        if self.data_file is None:
            return None
        return read_csv_columns(self.path / self.data_file)


def read_csv_columns(path: Path) -> dict[str, np.ndarray]:
    """Columns of a CSV: float64 when every cell parses as a number, else str."""
    with Path(path).open(encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader, None)
        if not header:
            raise GoldenFormatError(f"{path}: missing header")
        rows = []
        for cells in reader:
            if len(cells) != len(header):
                raise GoldenFormatError(
                    f"{path}: line {reader.line_num} has {len(cells)} cells, "
                    f"header has {len(header)}"
                )
            rows.append(cells)
    if not rows:
        raise GoldenFormatError(f"{path}: no rows")
    columns: dict[str, np.ndarray] = {}
    for i, name in enumerate(header):
        cells = [row[i] for row in rows]
        try:
            columns[name] = np.array([float(c) for c in cells], dtype=np.float64)
        except ValueError:
            columns[name] = np.array(cells, dtype=str)
    return columns


def _fail(case_dir: Path, message: str) -> GoldenFormatError:
    return GoldenFormatError(f"{case_dir}: {message}")


def _is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)


def _parse_value(case_dir: Path, key: str, value: Any) -> Value:
    if isinstance(value, bool) or _is_number(value):
        return value
    if (
        isinstance(value, list)
        and value
        and (all(isinstance(v, bool) for v in value) or all(_is_number(v) for v in value))
    ):
        return value
    raise _fail(
        case_dir,
        f"expected.{key} must be a finite number, a bool, or a non-empty list of one kind",
    )


def _parse_tolerance(case_dir: Path, raw: Any) -> dict[str, Tolerance]:
    if raw is None:
        raw = {"default": {"abs": 0.0, "rel": 1e-9}}
    if not isinstance(raw, Mapping) or "default" not in raw:
        raise _fail(case_dir, "tolerance needs a 'default' entry")
    parsed = {}
    for key, entry in raw.items():
        if not isinstance(entry, Mapping):
            raise _fail(case_dir, f"tolerance.{key} must be an object with abs and rel")
        for part in ("abs", "rel"):
            if not _is_number(entry.get(part)) or entry[part] < 0:
                raise _fail(case_dir, f"tolerance.{key}.{part} must be a number >= 0")
        parsed[key] = Tolerance(abs=float(entry["abs"]), rel=float(entry["rel"]))
    return parsed


def _parse_source(case_dir: Path, raw: Any) -> dict[str, Any]:
    if not isinstance(raw, Mapping):
        raise _fail(case_dir, "source must be an object")
    for key in _SOURCE_REQUIRED:
        if not isinstance(raw.get(key), str) or not raw[key]:
            raise _fail(case_dir, f"source.{key} must be a non-empty string")
    return dict(raw)


def parse_truth(raw: Any, case_dir: Path) -> GoldenCase:
    """Validate a parsed ``truth.json`` that lives in ``case_dir``."""
    if not isinstance(raw, Mapping):
        raise _fail(case_dir, f"{TRUTH_FILE} must hold an object")
    unknown = set(raw) - set(_REQUIRED) - set(_OPTIONAL)
    if unknown:
        raise _fail(case_dir, f"unknown key(s) {sorted(unknown)}")
    for key in _REQUIRED:
        if key not in raw:
            raise _fail(case_dir, f"missing key {key!r}")
    if raw["schema_version"] != SCHEMA_VERSION:
        raise _fail(case_dir, f"schema_version must be {SCHEMA_VERSION}")
    group, name = case_dir.parent.name, case_dir.name
    for part in (group, name):
        if not _SLUG.match(part):
            raise _fail(case_dir, f"{part!r} must be kebab-case")
    if raw["id"] != f"{group}/{name}":
        raise _fail(case_dir, f"id {raw['id']!r} must be {group}/{name}")
    if raw["method"] not in KNOWN_METHODS:
        raise _fail(case_dir, f"unknown method {raw['method']!r}")
    if not isinstance(raw["description"], str) or not raw["description"].strip():
        raise _fail(case_dir, "description must be a non-empty string")
    if not isinstance(raw["params"], Mapping):
        raise _fail(case_dir, "params must be an object")
    if not isinstance(raw["expected"], Mapping) or not raw["expected"]:
        raise _fail(case_dir, "expected must be a non-empty object")
    expected = {k: _parse_value(case_dir, k, v) for k, v in raw["expected"].items()}
    decision = raw.get("decision")
    if decision is not None and (not isinstance(decision, str) or not decision):
        raise _fail(case_dir, "decision must be a non-empty string or null")
    data_file = raw.get("data")
    if data_file is not None:
        if not isinstance(data_file, str) or not data_file.endswith(".csv"):
            raise _fail(case_dir, "data must name a .csv file in the case directory, or be null")
        if Path(data_file).name != data_file or not (case_dir / data_file).is_file():
            raise _fail(case_dir, f"data file {data_file!r} not found in the case directory")
    return GoldenCase(
        id=raw["id"],
        path=case_dir,
        method=raw["method"],
        description=raw["description"],
        params=dict(raw["params"]),
        expected=expected,
        decision=decision,
        tolerance=_parse_tolerance(case_dir, raw.get("tolerance")),
        source=_parse_source(case_dir, raw["source"]),
        data_file=data_file,
    )


def load_case(case_dir: Path) -> GoldenCase:
    case_dir = Path(case_dir)
    truth_path = case_dir / TRUTH_FILE
    try:
        raw = json.loads(truth_path.read_text(encoding="utf-8"))
    except FileNotFoundError as err:
        raise _fail(case_dir, f"no {TRUTH_FILE}") from err
    except json.JSONDecodeError as err:
        raise _fail(case_dir, f"{TRUTH_FILE} is not valid JSON: {err}") from err
    return parse_truth(raw, case_dir)


def load_dataset(root: Path) -> list[GoldenCase]:
    """Every ``<root>/<group>/<case>/`` sorted by id; any malformed case raises."""
    root = Path(root)
    if not root.is_dir():
        raise GoldenFormatError(f"{root}: not a directory")
    case_dirs = [d for g in root.iterdir() if g.is_dir() for d in g.iterdir() if d.is_dir()]
    if not case_dirs:
        raise GoldenFormatError(f"{root}: no golden cases")
    return sorted((load_case(d) for d in case_dirs), key=lambda c: c.id)
