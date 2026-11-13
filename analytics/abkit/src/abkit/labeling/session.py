"""The labelling session (gate G-B2-3): show each blinded readout, save each answer.

Only ``readouts/*.md`` and the labels file are read, never ``key.json``. Every answer is
appended to ``labels.csv`` at once, so quitting (``q``, Ctrl+Z / Ctrl+D) loses nothing and
the next session starts at the first readout without a label.
"""

from __future__ import annotations

import csv
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from abkit.labeling.export import READOUTS_DIR
from abkit.labeling.kappa import LABELS

LABEL_COLUMNS = ("readout", "label", "labelled_at")
_KEYS = {"s": "ship", "n": "no_ship", "i": "investigate"}
PROMPT = "Decision? s = ship, n = no ship, i = investigate, q = quit: "


def read_labels(path: Path) -> dict[str, str]:
    """``readout id -> label``; an unknown label or a readout labelled twice raises."""
    path = Path(path)
    if not path.exists():
        return {}
    labels: dict[str, str] = {}
    with path.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        if tuple(reader.fieldnames or ()) != LABEL_COLUMNS:
            raise ValueError(f"{path}: header must be {','.join(LABEL_COLUMNS)}")
        for row in reader:
            rid, label = row["readout"], row["label"]
            if label not in LABELS:
                raise ValueError(f"{path}: {rid} has label {label!r}; use one of {list(LABELS)}")
            if rid in labels:
                raise ValueError(f"{path}: {rid} is labelled twice")
            labels[rid] = label
    return labels


def _append(path: Path, readout_id: str, label: str) -> None:
    is_new = not path.exists() or path.stat().st_size == 0
    with path.open("a", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        if is_new:
            writer.writerow(LABEL_COLUMNS)
        writer.writerow([readout_id, label, datetime.now(UTC).isoformat(timespec="seconds")])


def readout_ids(export_dir: Path) -> list[str]:
    return sorted(p.stem for p in (Path(export_dir) / READOUTS_DIR).glob("*.md"))


def label_session(
    export_dir: Path,
    labels_path: Path,
    ask: Callable[[str], str] = input,
    say: Callable[[str], None] = print,
) -> int:
    """Label every readout without a label yet; return how many were labelled now."""
    export_dir, labels_path = Path(export_dir), Path(labels_path)
    ids = readout_ids(export_dir)
    if not ids:
        raise ValueError(f"{export_dir}: no blinded readouts under {READOUTS_DIR}/")
    done = read_labels(labels_path)
    todo = [rid for rid in ids if rid not in done]
    labelled = 0
    for n, rid in enumerate(todo, start=len(done) + 1):
        say(f"\n[{n}/{len(ids)}]\n")
        say((export_dir / READOUTS_DIR / f"{rid}.md").read_text(encoding="utf-8"))
        while True:
            try:
                answer = ask(PROMPT).strip().lower()
            except EOFError:
                return labelled
            if answer == "q":
                return labelled
            if answer in _KEYS:
                break
        _append(labels_path, rid, _KEYS[answer])
        labelled += 1
    say(f"All {len(ids)} readouts are labelled.")
    return labelled
