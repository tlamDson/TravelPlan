"""The M7 rows committed in runs.csv are what the estimator gives on the committed panel."""

import pytest

from abkit.did import m7
from abkit.did.actions import ACTIONS_PANEL_CSV
from abkit.runs import read_runs


def test_committed_m7_rows_match_a_fresh_run() -> None:
    committed = {r.metric: r for r in read_runs() if r.metric_id == "M7" and r.pr == "19"}
    assert committed, "runs.csv has no M7 rows from PR 19"
    fresh = m7.m7_records(m7.run_specs(ACTIONS_PANEL_CSV), pr="19", git_sha="x", run_at=_NOW)
    assert set(committed) == {r.metric for r in fresh}
    for record in fresh:
        assert committed[record.metric].value == pytest.approx(record.value, rel=1e-9, abs=1e-12)
        assert committed[record.metric].n == record.n
        assert committed[record.metric].simulated is False


_NOW = "2026-11-13T00:00:00+00:00"
