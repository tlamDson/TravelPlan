"""Methods a golden case may name, and the abkit code that answers each one.

``KNOWN_METHODS`` is the contract: ``analytics/golden/README.md`` lists the
data columns, params and output keys of each. ``IMPLEMENTATIONS`` maps a
method to an abkit function ``(data, params) -> outputs``; the statistics PRs
(B2 plan, PR 10 onward) register theirs here. A case whose method has no
implementation yet is reported as MISSING, never as passing.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

import numpy as np

from abkit.golden.case import KNOWN_METHODS

Data = dict[str, np.ndarray] | None
__all__ = ["IMPLEMENTATIONS", "KNOWN_METHODS", "Data", "Implementation"]

Implementation = Callable[[Data, Mapping[str, Any]], Mapping[str, Any]]

IMPLEMENTATIONS: dict[str, Implementation] = {}
