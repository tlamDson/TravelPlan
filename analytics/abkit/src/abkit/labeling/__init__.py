"""G-decide (B2 plan, PR 15b): blinded readouts, Lam's labels, and kappa against abkit (M11).

``abkit decide export`` writes about 30 readouts with abkit's conclusion hidden,
``abkit decide label`` walks Lam through them (gate G-B2-3), and ``abkit decide kappa``
compares the labels with the memo decision and with a "p < 0.05 only" baseline.
"""

from abkit.labeling.agreement import Agreement, agreement, to_run_records
from abkit.labeling.export import (
    DECIDE_ROOT,
    REAL_READOUTS,
    SAMPLE,
    baseline_label,
    export_blinded,
    memo_label,
    select_cases,
)
from abkit.labeling.kappa import LABELS, Kappa, cohen_kappa
from abkit.labeling.session import label_session, read_labels

__all__ = [
    "DECIDE_ROOT",
    "LABELS",
    "REAL_READOUTS",
    "SAMPLE",
    "Agreement",
    "Kappa",
    "agreement",
    "baseline_label",
    "cohen_kappa",
    "export_blinded",
    "label_session",
    "memo_label",
    "read_labels",
    "select_cases",
    "to_run_records",
]
