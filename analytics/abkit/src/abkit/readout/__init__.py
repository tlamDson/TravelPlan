"""Experiment readout (B2 plan, PR 15): SRM guardrail, one decision, a one-page memo.

``run_readout`` blocks the conclusion when the sample ratio check fails; ``render_memo``
turns a readout into Markdown; ``abkit readout`` and the Streamlit app (``[app]`` extra,
``readout/app.py``) read a golden case directory or a CSV with its params.
"""

from abkit.readout.analysis import Effect, Readout, run_readout
from abkit.readout.inputs import ReadoutInput, list_readout_cases, load_readout_input
from abkit.readout.memo import render_memo
from abkit.readout.spec import MetricSpec, ReadoutSpec

__all__ = [
    "Effect",
    "MetricSpec",
    "Readout",
    "ReadoutInput",
    "ReadoutSpec",
    "list_readout_cases",
    "load_readout_input",
    "render_memo",
    "run_readout",
]
