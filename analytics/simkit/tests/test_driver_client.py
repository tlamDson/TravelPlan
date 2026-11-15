import pytest

from simkit.driver.client import Tally, send_script
from simkit.driver.plan import UserScript

SCRIPT = UserScript("sim-u-000001", (({"eventId": "a"}, {"eventId": "b"}), ({"eventId": "c"},)))


def ok(batch):
    n = len(batch)
    return 200, {"received": n, "accepted": n - 1, "duplicates": 1, "quarantined": 0}


def test_sums_the_ingest_counts_of_every_batch():
    tally = Tally()
    send_script(ok, SCRIPT, tally)
    assert tally.counts() == {"received": 3, "accepted": 1, "duplicates": 2, "quarantined": 0}
    assert (tally.batches, tally.failed_batches, tally.retries, tally.unsent) == (2, 0, 0, 0)
    assert tally.sent == 3
    assert len(tally.latencies_ms) == 2


def test_retries_a_5xx_or_429_with_the_same_batch():
    calls = []
    answers = iter([(500, {}), (429, {})])

    def flaky(batch):
        calls.append(batch)
        return next(answers, None) or ok(batch)

    tally = Tally()
    send_script(flaky, SCRIPT, tally, max_attempts=3)
    assert calls[0] == calls[1] == calls[2] == SCRIPT.batches[0]
    assert tally.retries == 2
    assert tally.received == 3


def test_retries_a_connection_error():
    state = {"n": 0}

    def drops_once(batch):
        state["n"] += 1
        if state["n"] == 1:
            raise ConnectionError("reset")
        return ok(batch)

    tally = Tally()
    send_script(drops_once, SCRIPT, tally)
    assert tally.retries == 1
    assert tally.received == 3


def test_gives_up_after_max_attempts_and_counts_the_events_unsent():
    tally = Tally()
    send_script(lambda b: (503, {}), SCRIPT, tally, max_attempts=2)
    assert tally.failed_batches == 2
    assert tally.unsent == 3
    assert tally.received == 0
    assert tally.sent == 3


def test_a_4xx_is_not_retried():
    calls = []

    def bad(batch):
        calls.append(batch)
        return 400, {"success": False}

    tally = Tally()
    send_script(bad, SCRIPT, tally)
    assert len(calls) == 2
    assert tally.failed_batches == 2
    assert tally.retries == 0


def test_a_200_with_a_body_off_contract_is_a_failure():
    tally = Tally()
    send_script(lambda b: (200, {"received": 1}), SCRIPT, tally, max_attempts=1)
    assert tally.failed_batches == 2
    assert tally.received == 0


def test_max_attempts_must_be_positive():
    with pytest.raises(ValueError, match="max_attempts"):
        send_script(ok, SCRIPT, Tally(), max_attempts=0)


def test_tallies_merge_and_round_trip():
    a, b = Tally(), Tally()
    send_script(ok, SCRIPT, a)
    send_script(lambda x: (503, {}), SCRIPT, b, max_attempts=1)
    merged = Tally.from_dict(a.to_dict()).merge(b)
    assert merged.received == 3
    assert merged.failed_batches == 2
    assert merged.unsent == 3
    assert merged.batches == 4
    assert merged.latencies_ms == a.latencies_ms + b.latencies_ms
    assert Tally.from_dict(merged.to_dict()) == merged


def test_merge_keeps_the_largest_concurrency_not_the_sum():
    a = Tally(spawned_users=10, peak_active=7)
    b = Tally(spawned_users=10, peak_active=9)
    merged = a.merge(b)
    assert (merged.spawned_users, merged.peak_active) == (10, 9)
    assert Tally.from_dict(merged.to_dict()) == merged


def test_latency_percentile():
    tally = Tally(latencies_ms=[float(i) for i in range(1, 101)])
    assert tally.latency_ms(0.95) == pytest.approx(95.05)
    assert Tally().latency_ms(0.95) is None
