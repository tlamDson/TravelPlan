import pytest

from simkit.driver.client import Tally
from simkit.driver.reconcile import reconcile

EXPECTED = {"received": 10, "accepted": 7, "duplicates": 2, "quarantined": 1}
IDS = {f"e{i}" for i in range(7)}


def good_tally(**over):
    base = dict(
        received=10,
        accepted=7,
        duplicates=2,
        quarantined=1,
        batches=3,
        spawned_users=3,
        peak_active=3,
    )
    return Tally(**{**base, **over})


def run(tally=None, **over):
    args = dict(
        sent=10,
        expected=EXPECTED,
        tally=tally or good_tally(),
        stored_events=7,
        stored_quarantine=1,
        accepted_ids=IDS,
        exported_ids=IDS,
        vus=3,
        scripts=5,
    )
    return reconcile(**{**args, **over})


def test_all_checks_pass_when_every_count_agrees():
    result = run()
    assert result.ok
    assert result.failures() == []
    assert result.checks["accepted = sent - duplicates - quarantined"] == (7, 7)


@pytest.mark.parametrize(
    ("over", "check"),
    [
        ({"sent": 11}, "received = sent"),
        ({"tally": good_tally(accepted=6, received=9)}, "accepted = expected"),
        ({"tally": good_tally(duplicates=3)}, "duplicates = expected"),
        ({"tally": good_tally(quarantined=0, accepted=8)}, "quarantined = expected"),
        ({"stored_events": 6}, "stored events = accepted"),
        ({"stored_quarantine": 2}, "stored quarantine = quarantined"),
        ({"exported_ids": IDS - {"e0"}}, "exported rows = accepted"),
        ({"exported_ids": (IDS - {"e0"}) | {"x"}}, "exported ids = accepted ids"),
        ({"tally": good_tally(failed_batches=1)}, "failed batches = 0"),
        ({"tally": good_tally(spawned_users=2)}, "spawned locust users = vus"),
        ({"tally": good_tally(peak_active=2)}, "peak concurrent virtual users = min(vus, scripts)"),
    ],
)
def test_each_mismatch_is_reported(over, check):
    result = run(**over)
    assert not result.ok
    assert check in [name for name, _, _ in result.failures()]


def test_a_check_compares_expected_with_actual():
    result = run(stored_events=6)
    assert ("stored events = accepted", 7, 6) in result.failures()


def test_the_concurrency_target_is_capped_by_the_number_of_scripts():
    result = run(vus=8, scripts=3, tally=good_tally(spawned_users=8, peak_active=3))
    assert result.ok, result.failures()
    assert result.checks["peak concurrent virtual users = min(vus, scripts)"] == (3, 3)


def test_a_run_that_never_reached_its_concurrency_fails():
    # 1k Locust users requested, but the work ran out while only part of them were active.
    result = run(vus=1000, scripts=1040, tally=good_tally(spawned_users=1000, peak_active=370))
    assert ("peak concurrent virtual users = min(vus, scripts)", 1000, 370) in result.failures()
