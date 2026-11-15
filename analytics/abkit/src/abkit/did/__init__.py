"""Staggered difference in differences on the GitHub Actions panel (B2 plan, PR 19, M7).

``sun_abraham`` is the Sun & Abraham (2021) interaction-weighted event study with a joint
Wald pre-trend test; ``twfe_event_study`` and ``twfe_static`` are the two-way fixed-effects
baselines it corrects. ``abkit.did.m7`` runs the fixed specs on the committed panel.
"""

from abkit.did.actions import ACTIONS_PANEL_CSV, load_actions_panel
from abkit.did.fe import FEFit, fe_ols
from abkit.did.panel import CONTROLS, NEVER, DidPanel, placebo_shift
from abkit.did.results import EventStudy, EventTime
from abkit.did.sunab import sun_abraham, twfe_event_study, twfe_static

__all__ = [
    "ACTIONS_PANEL_CSV",
    "CONTROLS",
    "DidPanel",
    "EventStudy",
    "EventTime",
    "FEFit",
    "NEVER",
    "fe_ols",
    "load_actions_panel",
    "placebo_shift",
    "sun_abraham",
    "twfe_event_study",
    "twfe_static",
]
