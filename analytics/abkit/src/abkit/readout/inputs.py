"""Readout inputs for the CLI and the Streamlit app: a golden case directory, or a CSV + params.

From a golden case only ``params``, ``description`` and ``source.simulated`` are read; the
frozen ``expected`` values and ``decision`` stay hidden, so the memo cannot copy its answer.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from abkit.golden.case import TRUTH_FILE, load_case, load_dataset, read_csv_columns
from abkit.readout.analysis import Readout, run_readout
from abkit.readout.memo import render_memo


@dataclass(frozen=True)
class ReadoutInput:
    title: str
    data: dict[str, np.ndarray]
    params: dict[str, Any]
    simulated: bool
    description: str | None = None

    def readout(self) -> Readout:
        return run_readout(self.data, self.params)

    def memo(self) -> str:
        return render_memo(
            self.readout(), title=self.title, simulated=self.simulated, description=self.description
        )


def _from_case(case_dir: Path, simulated: bool | None) -> ReadoutInput:
    case = load_case(case_dir)
    if case.method != "readout":
        raise ValueError(f"{case.id} is a {case.method!r} case, not a readout")
    case_simulated = bool(case.source.get("simulated", False))
    if simulated is not None and simulated != case_simulated:
        kind = "simulated" if case_simulated else "real"
        raise ValueError(f"{case.id} holds {kind} data; it cannot be labelled otherwise")
    return ReadoutInput(
        title=case.id,
        data=case.read_data(),
        params=dict(case.params),
        simulated=case_simulated,
        description=case.description,
    )


def load_readout_input(
    path: Path, params_path: Path | None = None, simulated: bool | None = None
) -> ReadoutInput:
    """A case directory (its ``truth.json`` params), or a CSV with a params JSON file.

    A CSV must say whether it holds simulated (virtual) or real users.
    """
    path = Path(path)
    if path.is_dir() and (path / TRUTH_FILE).is_file():
        return _from_case(path, simulated)
    if path.suffix != ".csv" or not path.is_file():
        raise ValueError(f"{path}: expected a readout case directory or a .csv file")
    if params_path is None:
        raise ValueError(f"{path}: a CSV needs a params JSON file (--params)")
    if simulated is None:
        raise ValueError("say whether the CSV holds simulated (virtual) users or real users")
    params = json.loads(Path(params_path).read_text(encoding="utf-8"))
    if not isinstance(params, dict):
        raise ValueError(f"{params_path}: params must be a JSON object")
    return ReadoutInput(path.stem, read_csv_columns(path), params, simulated)


def list_readout_cases(root: Path) -> list[Path]:
    """Directories of the ``readout`` cases of a golden dataset, sorted by case id."""
    return [c.path for c in load_dataset(root) if c.method == "readout"]
