"""M11: Cohen's kappa of Lam's labels against the memo decision and the p-only baseline."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from abkit.labeling.export import KEY_FILE
from abkit.labeling.kappa import Kappa, cohen_kappa
from abkit.labeling.session import read_labels
from abkit.runs import RunRecord

#: (readout id, Lam's label, the other rater's label)
Disagreement = tuple[str, str, str]


@dataclass(frozen=True)
class Agreement:
    n: int
    simulated: int
    real: int
    memo: Kappa
    baseline: Kappa
    disagreements_memo: tuple[Disagreement, ...]
    disagreements_baseline: tuple[Disagreement, ...]

    def format(self) -> str:
        def line(name: str, k: Kappa) -> str:
            return (
                f"{name}: kappa = {k.kappa:.3f} (95% CI {k.ci_low:.3f} to {k.ci_high:.3f}), "
                f"agreement {k.observed:.1%}, chance {k.expected:.1%}"
            )

        out = [
            f"{self.n} labelled readouts ({self.simulated} simulated, {self.real} real users)",
            line("memo vs Lam", self.memo),
            line("p < 0.05 only vs Lam", self.baseline),
        ]
        for name, rows in (
            ("memo", self.disagreements_memo),
            ("p-only", self.disagreements_baseline),
        ):
            for rid, lam, other in rows:
                out.append(f"  {rid}: Lam {lam}, {name} {other}")
        return "\n".join(out)


def _key(export_dir: Path) -> dict[str, dict]:
    path = Path(export_dir) / KEY_FILE
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not isinstance(raw.get("readouts"), dict):
        raise ValueError(f"{path}: not a G-decide key (no readouts)")
    return raw["readouts"]


def agreement(export_dir: Path, labels_path: Path, partial: bool = False) -> Agreement:
    """Kappa on the labelled readouts; every readout must be labelled unless ``partial``."""
    key = _key(export_dir)
    labels = read_labels(labels_path)
    if not labels:
        raise ValueError(f"{labels_path}: no labels yet; run `abkit decide label` first")
    stray = sorted(set(labels) - set(key))
    if stray:
        raise ValueError(f"{labels_path}: readout(s) {stray} are not in the export")
    unlabelled = len(key) - len(labels)
    if unlabelled and not partial:
        raise ValueError(f"{unlabelled} of {len(key)} readouts have no label yet")
    ids = sorted(labels)
    lam = [labels[i] for i in ids]

    def against(field: str) -> tuple[Kappa, tuple[Disagreement, ...]]:
        other = [key[i][field] for i in ids]
        diff = tuple((i, a, b) for i, a, b in zip(ids, lam, other, strict=True) if a != b)
        return cohen_kappa(other, lam), diff

    memo, memo_diff = against("memo")
    baseline, baseline_diff = against("baseline")
    simulated = sum(bool(key[i]["simulated"]) for i in ids)
    return Agreement(
        len(ids), simulated, len(ids) - simulated, memo, baseline, memo_diff, baseline_diff
    )


def _git_sha() -> str:
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True)
    except OSError:
        return "unknown"
    return out.stdout.strip() or "unknown"


def to_run_records(
    result: Agreement, run_at: str | None = None, rater: str = "Lam"
) -> list[RunRecord]:
    """Two M11 rows; ``simulated`` is true because most readouts are virtual users."""
    run_at = run_at or datetime.now(UTC).isoformat(timespec="seconds")
    notes = (
        f"readouts={result.n} simulated={result.simulated} real={result.real} "
        f"labels=ship/no_ship/investigate rater={rater}"
    )
    sha = _git_sha()
    rows = (("decision_kappa_memo", result.memo), ("decision_kappa_p05_baseline", result.baseline))
    return [
        RunRecord(
            run_at=run_at,
            git_sha=sha,
            pr="15b",
            metric_id="M11",
            metric=metric,
            value=round(k.kappa, 4),
            unit="kappa",
            n=result.n,
            seed="",
            simulated=result.simulated > 0,
            notes=f"{notes} agreement={k.observed:.4f} se={k.se:.4f}",
        )
        for metric, k in rows
    ]
