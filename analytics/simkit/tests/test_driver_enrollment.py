from datetime import date

import pytest

from simkit.driver.enrollment import enrollment_table, readout_params

START = date(2026, 11, 1)
KEY = "save-trip-cta-v1"


def exposure(user, at, variant, key=KEY):
    return {
        "name": "experiment_exposure",
        "userId": user,
        "occurredAt": at,
        "properties": {"experimentKey": key, "variant": variant, "bucket": 1},
    }


def save(user, at):
    return {"name": "trip_saved", "userId": user, "occurredAt": at, "properties": {}}


def table(events, days=14, window=7):
    return enrollment_table(events, KEY, start=START, days=days, window_days=window)


def rows(t):
    return sorted(zip(t["variant"], t["saves"], strict=True))


def test_counts_target_events_in_the_window_after_the_first_exposure():
    events = [
        save("u1", "2026-11-01T09:00:00.000Z"),  # before exposure: not counted
        exposure("u1", "2026-11-01T10:00:00.000Z", "treatment"),
        save("u1", "2026-11-01T10:00:00.000Z"),  # at exposure: counted
        exposure("u1", "2026-11-03T10:00:00.000Z", "treatment"),  # later exposure ignored
        save("u1", "2026-11-08T09:59:59.999Z"),  # last ms of the window
        save("u1", "2026-11-08T10:00:00.000Z"),  # window end is exclusive
        exposure("u2", "2026-11-02T00:00:00.000Z", "control"),
    ]
    assert rows(table(events)) == [("control", 0), ("treatment", 2)]


def test_users_first_exposed_too_late_for_a_full_window_are_not_enrolled():
    events = [
        exposure("early", "2026-11-07T23:59:59.999Z", "control"),  # day 6 < 14 - 7
        exposure("late", "2026-11-08T00:00:00.000Z", "control"),  # day 7
    ]
    assert table(events)["variant"] == ["control"]


def test_ignores_anonymous_events_other_experiments_and_unexposed_users():
    events = [
        exposure(None, "2026-11-01T10:00:00.000Z", "treatment"),
        exposure("u1", "2026-11-01T10:00:00.000Z", "treatment", key="other-exp"),
        save("u2", "2026-11-01T11:00:00.000Z"),
        exposure("u3", "2026-11-01T10:00:00.000Z", "control"),
    ]
    assert rows(table(events)) == [("control", 0)]


def test_the_variant_is_the_one_of_the_earliest_exposure_whatever_the_input_order():
    events = [
        exposure("u1", "2026-11-02T10:00:00.000Z", "control"),
        exposure("u1", "2026-11-01T10:00:00.000Z", "treatment"),
    ]
    assert table(events)["variant"] == ["treatment"]


def test_accepts_timestamps_with_an_offset_like_exported_rows():
    events = [
        exposure("u1", "2026-11-01T10:00:00+00:00", "treatment"),
        save("u1", "2026-11-01T12:00:00.000Z"),
    ]
    assert rows(table(events)) == [("treatment", 1)]


def test_window_must_be_shorter_than_the_run():
    with pytest.raises(ValueError, match="window_days"):
        table([], days=7, window=7)


def test_readout_params_take_the_planned_shares_from_the_definition():
    definition = {
        "key": KEY,
        "salt": "sim",
        "holdoutBuckets": 0,
        "variants": [
            {"key": "control", "weight": 6000},
            {"key": "treatment", "weight": 4000},
        ],
    }
    params = readout_params(definition)
    assert params["expected_shares"] == {"control": 0.6, "treatment": 0.4}
    assert params["metric"] == {"kind": "mean", "column": "saves"}
    assert params["alpha"] == 0.05
