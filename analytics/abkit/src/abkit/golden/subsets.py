"""Named subsets of a golden dataset, kept in ``<root>/subsets.json``.

    {"ci-fast": {"description": "...", "entries": ["welch", "sim-aa/aa-01"]}}

An entry is a whole group (``welch``) or one case id (``sim-aa/aa-01``); each must match at
least one case, so a renamed case cannot silently drop out of a subset.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path

from abkit.golden.case import GoldenCase, GoldenFormatError, load_dataset

SUBSETS_FILE = "subsets.json"
_KEYS = {"description", "entries"}


def load_subset(root: Path, name: str, cases: Sequence[GoldenCase] | None = None) -> frozenset[str]:
    """Ids of the cases in subset ``name`` of the dataset at ``root``."""
    path = Path(root) / SUBSETS_FILE
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as err:
        raise GoldenFormatError(f"{path}: no {SUBSETS_FILE}") from err
    except json.JSONDecodeError as err:
        raise GoldenFormatError(f"{path}: not valid JSON: {err}") from err
    if not isinstance(raw, dict) or name not in raw:
        raise GoldenFormatError(f"{path}: no subset {name!r}")
    spec = raw[name]
    if not isinstance(spec, dict) or set(spec) - _KEYS:
        raise GoldenFormatError(f"{path}: subset {name!r} has unknown key(s)")
    description, entries = spec.get("description"), spec.get("entries")
    if not isinstance(description, str) or not description.strip():
        raise GoldenFormatError(f"{path}: subset {name!r} needs a description")
    if not isinstance(entries, list) or not entries or not all(isinstance(e, str) for e in entries):
        raise GoldenFormatError(f"{path}: subset {name!r} entries must be a non-empty list")
    cases = load_dataset(root) if cases is None else cases
    chosen: set[str] = set()
    for entry in entries:
        matched = {c.id for c in cases if entry in (c.id, c.group)}
        if not matched:
            raise GoldenFormatError(f"{path}: subset {name!r} entry {entry!r} matches no case")
        chosen |= matched
    return frozenset(chosen)
