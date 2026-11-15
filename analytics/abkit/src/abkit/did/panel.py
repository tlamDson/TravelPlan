"""The unit x period panel a staggered DiD runs on (B2 plan, PR 19).

One row per unit and period with an observed outcome (the panel may be unbalanced).
``cohort`` is the first treated period of the row's unit, or ``NEVER``. A unit whose cohort
is after the last period of the panel is a *late* adopter: untreated in every row, so it
serves as a control (not yet treated) unless the estimator is told to use ``NEVER`` only.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike

#: Cohort code of a unit that never adopts.
NEVER = -1
#: Control sets: never-treated plus late adopters, or never-treated only.
CONTROLS = ("never_and_late", "never")


@dataclass(frozen=True, eq=False)
class DidPanel:
    unit: np.ndarray  # int codes into ``units``
    time: np.ndarray  # int period index, >= 0
    y: np.ndarray
    cohort: np.ndarray  # first treated period of the unit, or NEVER
    weight: np.ndarray
    units: tuple[str, ...]

    @classmethod
    def from_arrays(
        cls,
        unit: Sequence[str] | ArrayLike,
        time: ArrayLike,
        y: ArrayLike,
        cohort: ArrayLike,
        weight: ArrayLike | None = None,
    ) -> DidPanel:
        labels, codes = np.unique(np.asarray(unit, dtype=str), return_inverse=True)
        time_arr = np.asarray(time)
        n = codes.size
        weights = np.ones(n) if weight is None else np.asarray(weight, dtype=np.float64)
        arrays = (time_arr, np.asarray(y), np.asarray(cohort), weights)
        if any(a.shape != (n,) for a in arrays):
            raise ValueError("unit, time, y, cohort and weight must have the same length")
        return cls(
            unit=codes.astype(np.int64),
            time=time_arr.astype(np.int64),
            y=np.asarray(y, dtype=np.float64),
            cohort=np.asarray(cohort).astype(np.int64),
            weight=weights,
            units=tuple(str(label) for label in labels),
        )

    def __post_init__(self) -> None:
        if not np.all(np.isfinite(self.y)):
            raise ValueError("y must hold only finite values")
        if self.time.size and self.time.min() < 0:
            raise ValueError("time must be a non-negative period index")
        if not np.all(np.isfinite(self.weight)) or np.any(self.weight <= 0):
            raise ValueError("weight must be positive and finite")
        first = np.full(len(self.units), np.iinfo(np.int64).min)
        first[self.unit] = self.cohort
        if np.any(first[self.unit] != self.cohort):
            raise ValueError("cohort must be constant within a unit")
        keys = self.unit * (int(self.time.max(initial=0)) + 1) + self.time
        if np.unique(keys).size != keys.size:
            raise ValueError("a unit may appear only once per unit and period")

    @property
    def n_obs(self) -> int:
        return int(self.y.size)

    @property
    def n_units(self) -> int:
        return len(self.units)

    @property
    def is_late(self) -> np.ndarray:
        """Rows of units adopting after the last period of the panel."""
        return self.cohort > self.time.max(initial=0)

    @property
    def is_control(self) -> np.ndarray:
        """Rows of never-treated and late-adopting units."""
        return (self.cohort == NEVER) | self.is_late

    def subset(self, mask: np.ndarray) -> DidPanel:
        """The rows where ``mask`` holds; units left without rows are dropped."""
        mask = np.asarray(mask, dtype=bool)
        return DidPanel.from_arrays(
            unit=np.asarray(self.units)[self.unit[mask]],
            time=self.time[mask],
            y=self.y[mask],
            cohort=self.cohort[mask],
            weight=self.weight[mask],
        )


def placebo_shift(panel: DidPanel, shift: int) -> DidPanel:
    """A fake adoption ``shift`` periods early, on the treated units' pre-adoption rows only.

    Controls (late adopters included) keep every row. With no anticipation the placebo
    effect is zero, so a clear non-zero estimate flags diverging trends before adoption.
    Treated units whose fake adoption would fall before period 1 (no period before it to
    compare with) are dropped.
    """
    if shift < 1:
        raise ValueError(f"shift must be a positive number of periods, got {shift}")
    treated = ~panel.is_control
    keep = ~treated | ((panel.time < panel.cohort) & (panel.cohort - shift >= 1))
    cohort = np.where(treated, panel.cohort - shift, panel.cohort)
    shifted = DidPanel.from_arrays(
        unit=np.asarray(panel.units)[panel.unit],
        time=panel.time,
        y=panel.y,
        cohort=cohort,
        weight=panel.weight,
    )
    return shifted.subset(keep)
