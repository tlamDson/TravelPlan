"""Export the G-decide set: about 30 blinded readouts plus the key that unblinds them.

28 G-sim readout cases (a seeded, stratified draw over every G-sim group) and 2 real
readouts (Hillstrom e-mail test, public data) are shuffled into ``R01``..``R30``.
``readouts/RNN.md`` is what the labeller sees. ``key.json`` maps each blind id to its
case, abkit's memo decision and the "p < alpha only" baseline (M11); the labelling
session never opens it.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from abkit.golden.case import load_case, load_dataset
from abkit.labeling.blind import Look, render_blinded
from abkit.labeling.kappa import LABELS
from abkit.readout import Readout, load_readout_input, measure_effect, run_readout

DECIDE_ROOT = Path(__file__).resolve().parents[4] / "golden/decide/v1"
SEED = 1115
KEY_FILE = "key.json"
READOUTS_DIR = "readouts"
LABELS_FILE = "labels.csv"

#: Readouts drawn from each G-sim group (28 in all).
SAMPLE: dict[str, int] = {
    "sim-aa": 5,
    "sim-effect": 8,
    "sim-long-tail": 3,
    "sim-novelty": 3,
    "sim-peeking": 3,
    "sim-ratio": 3,
    "sim-srm": 3,
}
_HILLSTROM = (
    "Public Hillstrom e-mail test (MineThatData, 2008): customers who got the men's "
    "e-mail versus no e-mail. These are real shoppers, not TravelPlan users."
)
#: Real readouts: G-public case id -> context line; the metric is its ``value`` column.
REAL_READOUTS: dict[str, str] = {
    "hillstrom/mens-visit": f"{_HILLSTROM} Metric: visited the site within two weeks (0/1).",
    "hillstrom/mens-spend": f"{_HILLSTROM} Metric: dollars spent within two weeks.",
}
_REAL_PARAMS: dict[str, Any] = {
    "alpha": 0.05,
    "srm_threshold": 0.0005,
    "expected_shares": {"control": 0.5, "treatment": 0.5},
    "metric": {"kind": "mean", "column": "value"},
}
_MEMO_LABELS = {"ship": "ship", "no_ship": "no_ship", "invalid": "investigate"}


@dataclass(frozen=True)
class _Blinded:
    case: str
    simulated: bool
    readout: Readout
    context: str | None
    looks: tuple[Look, ...]


def memo_label(decision: str) -> str:
    """abkit's readout decision as a G-decide label: a blocked (invalid) readout is investigated."""
    if decision not in _MEMO_LABELS:
        raise ValueError(f"unknown readout decision {decision!r}")
    return _MEMO_LABELS[decision]


def baseline_label(readout: Readout) -> str:
    """M11 baseline: ship whenever ``p < alpha`` and the lift is positive, SRM or not."""
    e = readout.primary
    return "ship" if e.p_value < readout.spec.alpha and e.estimate > 0 else "no_ship"


def select_cases(
    root: Path,
    seed: int = SEED,
    sample: Mapping[str, int] = SAMPLE,
    real: Mapping[str, str] = REAL_READOUTS,
) -> list[str]:
    """Case ids of the export: a seeded draw per G-sim group, then the real readouts."""
    cases = load_dataset(root)
    readouts = {c.id for c in cases if c.method == "readout"}
    rng = np.random.default_rng(seed)
    chosen: list[str] = []
    for group in sorted(sample):
        ids = sorted(i for i in readouts if i.split("/")[0] == group)
        if len(ids) < sample[group]:
            raise ValueError(f"{group}: {sample[group]} readouts wanted, {len(ids)} in {root}")
        picks = rng.choice(len(ids), size=sample[group], replace=False)
        chosen += sorted(ids[i] for i in picks)
    missing = sorted(set(real) - {c.id for c in cases})
    if missing:
        raise ValueError(f"real readout case(s) {missing} not in {root}")
    return chosen + sorted(real)


def _looks(data: Mapping[str, np.ndarray], readout: Readout) -> tuple[Look, ...]:
    spec = readout.spec
    if not spec.looks:
        return ()
    day = np.asarray(data["exposure_day"], dtype=np.float64)
    looks = []
    for d in spec.looks:
        try:
            effect = measure_effect(spec.metric, data, day < d - spec.window_days, spec.alpha)
        except ValueError:
            effect = None
        looks.append(Look(d, effect))
    return tuple(looks)


def _blind(root: Path, case_id: str) -> _Blinded:
    if case_id in REAL_READOUTS:
        data, params, simulated = load_case(root / case_id).read_data(), _REAL_PARAMS, False
        context = REAL_READOUTS[case_id]
    else:
        inp = load_readout_input(root / case_id)
        data, params, simulated, context = inp.data, inp.params, inp.simulated, None
    readout = run_readout(data, params, effects_when_blocked=True)
    return _Blinded(case_id, simulated, readout, context, _looks(data, readout))


def _write(path: Path, text: str) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def export_blinded(root: Path, out: Path, seed: int = SEED, force: bool = False) -> dict:
    """Write ``out/readouts/RNN.md`` and ``out/key.json``; return the key."""
    root, out = Path(root), Path(out)
    readouts_dir = out / READOUTS_DIR
    if (out / LABELS_FILE).exists():
        raise FileExistsError(f"{out / LABELS_FILE} exists; a new export would not match it")
    if not force and ((out / KEY_FILE).exists() or readouts_dir.exists()):
        raise FileExistsError(f"{out} already holds an export; pass force to replace it")
    ids = select_cases(root, seed)
    order = np.random.default_rng([seed, 1]).permutation(len(ids))
    readouts_dir.mkdir(parents=True, exist_ok=True)
    for old in readouts_dir.glob("*.md"):
        old.unlink()
    entries: dict[str, dict[str, Any]] = {}
    for n, i in enumerate(order, start=1):
        blind_id = f"R{n:02d}"
        b = _blind(root, ids[i])
        text = render_blinded(
            b.readout, blind_id=blind_id, simulated=b.simulated, context=b.context, looks=b.looks
        )
        _write(readouts_dir / f"{blind_id}.md", text)
        entries[blind_id] = {
            "case": b.case,
            "simulated": b.simulated,
            "memo": memo_label(b.readout.decision),
            "baseline": baseline_label(b.readout),
        }
    key = {
        "schema_version": 1,
        "golden": root.name,
        "seed": seed,
        "labels": list(LABELS),
        "memo": "abkit readout decision; invalid (SRM) -> investigate",
        "baseline": "ship when p < alpha and the estimate > 0, ignoring SRM; else no_ship",
        "readouts": entries,
    }
    _write(out / KEY_FILE, json.dumps(key, indent=2) + "\n")
    return key
