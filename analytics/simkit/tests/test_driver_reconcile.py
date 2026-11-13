import pytest

from simkit.driver.client import Tally
from simkit.driver.reconcile import reconcile

EXPECTED = {"received": 10, "accepted": 7, "duplicates": 2, "quarantined": 1}
IDS = {f"e{i}" for i in range(7)}


def good_tally(**over):
    base = dict(received=10, accepted=7, duplicates=2, quarantined=1, batches=3)
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
    ],
)
def test_each_mismatch_is_reported(over, check):
    result = run(**over)
    assert not result.ok
    assert check in [name for name, _, _ in result.failures()]


def test_a_check_compares_expected_with_actual():
    result = run(stored_events=6)
    assert ("stored events = accepted", 7, 6) in result.failures()
