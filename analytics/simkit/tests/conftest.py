from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
GOLDEN_EVENTS = REPO_ROOT / "packages/shared/fixtures/golden-events"


@pytest.fixture
def repo_root() -> Path:
    return REPO_ROOT


@pytest.fixture
def golden_events() -> Path:
    return GOLDEN_EVENTS
