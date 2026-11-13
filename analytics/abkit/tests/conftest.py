import copy
import json
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
GOLDEN_V1 = REPO_ROOT / "analytics/golden/v1"
#: v2 re-froze the root-solved t-test power cases (v1 kept for comparison).
GOLDEN_V2 = REPO_ROOT / "analytics/golden/v2"
GOLDEN_LATEST = GOLDEN_V2

BASE_TRUTH: dict[str, Any] = {
    "schema_version": 1,
    "id": "welch/tiny",
    "method": "welch_ttest",
    "description": "Two tiny groups.",
    "data": "data.csv",
    "params": {"alpha": 0.05, "alternative": "two-sided"},
    "expected": {"estimate": 1.0, "p_value": 0.25},
    "decision": "fail_to_reject",
    "tolerance": {"default": {"abs": 1e-9, "rel": 1e-9}},
    "source": {
        "tool": "scipy",
        "version": "1.14.1",
        "call": "scipy.stats.ttest_ind(treatment, control, equal_var=False)",
    },
}

BASE_CSV = "variant,value\ncontrol,1.0\ncontrol,2.0\ntreatment,2.5\ntreatment,2.5\n"


def write_case(
    root: Path,
    group: str = "welch",
    name: str = "tiny",
    csv_text: str | None = BASE_CSV,
    **overrides: Any,
) -> Path:
    """Write one golden case under ``root/<group>/<name>/`` and return its directory."""
    truth = copy.deepcopy(BASE_TRUTH)
    truth["id"] = f"{group}/{name}"
    truth.update(overrides)
    case_dir = root / group / name
    case_dir.mkdir(parents=True, exist_ok=True)
    (case_dir / "truth.json").write_text(json.dumps(truth, indent=2), encoding="utf-8")
    if csv_text is not None:
        (case_dir / "data.csv").write_text(csv_text, encoding="utf-8")
    return case_dir


@pytest.fixture
def repo_root() -> Path:
    return REPO_ROOT
