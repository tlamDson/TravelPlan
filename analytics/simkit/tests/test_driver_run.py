from datetime import date

import pytest
from fake_ingest import FakeIngest

from simkit.driver import run as run_module
from simkit.driver.client import Tally, send_script
from simkit.driver.exported import read_export
from simkit.driver.reconcile import reconcile
from simkit.driver.run import (
    DEFAULT_EXPERIMENT,
    analyze,
    build_parser,
    export_days,
    prepare,
    to_run_records,
)

START = date(2026, 11, 1)


@pytest.fixture(scope="module")
def prepared():
    return prepare(
        users=300,
        days=10,
        seed=11,
        start=START,
        experiment=DEFAULT_EXPERIMENT,
        faults={"duplicate": 40, "wrong_type": 4},
    )


@pytest.fixture(scope="module")
def loaded(prepared, tmp_path_factory):
    fake = FakeIngest()
    tally = Tally()
    for script in prepared.scripts:
        send_script(lambda b: (200, fake.ingest(list(b))), script, tally)
    tally.spawned_users = tally.peak_active = 1  # one in-process "Locust user"
    out = tmp_path_factory.mktemp("export")
    fake.export(out)
    return fake, tally, read_export(out)


def test_prepare_plans_every_simulated_event_and_knows_the_expected_counts(prepared):
    assert prepared.sent == len(prepared.events) == sum(s.n_events for s in prepared.scripts)
    assert prepared.expected["duplicates"] == 40
    assert prepared.expected["quarantined"] == 4
    assert all(
        s.key.startswith("sim-") for s in prepared.scripts
    ), "every simulated id carries the sim- prefix"


def test_export_days_span_the_accepted_events(prepared):
    days = export_days(prepared.accepted_events)
    assert days[0] == "2026-11-01"
    assert days == sorted(set(days))
    assert {e["occurredAt"][:10] for e in prepared.accepted_events} <= set(days)


def test_through_a_fake_ingest_the_counts_reconcile(prepared, loaded):
    fake, tally, rows = loaded
    result = reconcile(
        sent=prepared.sent,
        expected=prepared.expected,
        tally=tally,
        stored_events=len(fake.stored),
        stored_quarantine=len(fake.quarantine),
        accepted_ids=prepared.accepted_ids,
        exported_ids=[r["eventId"] for r in rows],
        vus=1,
        scripts=len(prepared.scripts),
    )
    assert result.ok, result.failures()
    assert tally.accepted == prepared.sent - 40 - 4


def test_abkit_on_the_export_matches_abkit_on_the_simulated_events(prepared, loaded):
    _, _, rows = loaded
    result = analyze(prepared, rows)
    assert result.same_table
    assert result.n_users > 0
    assert result.exported.counts == result.direct.counts
    assert result.exported.primary.estimate == result.direct.primary.estimate
    assert result.exported.primary.p_value == result.direct.primary.p_value
    assert result.estimate_abs_diff == 0.0


def test_a_lost_event_shows_up_as_a_different_table(prepared, loaded):
    _, _, rows = loaded
    save = next(i for i, r in enumerate(rows) if r["name"] == "trip_saved")
    exposures = [r for r in rows if r["name"] == "experiment_exposure"]
    dropped = [r for r in rows if r is not rows[save] and r not in exposures[:50]]
    assert not analyze(prepared, dropped).same_table


def test_run_records_are_simulated_rows_of_pr_16(prepared, loaded):
    fake, tally, rows = loaded
    rec = reconcile(
        sent=prepared.sent,
        expected=prepared.expected,
        tally=tally,
        stored_events=len(fake.stored),
        stored_quarantine=len(fake.quarantine),
        accepted_ids=prepared.accepted_ids,
        exported_ids=[r["eventId"] for r in rows],
        vus=1,
        scripts=len(prepared.scripts),
    )
    records = to_run_records(
        prepared,
        tally,
        rec,
        analyze(prepared, rows),
        vus=50,
        load_seconds=2.0,
        run_at="2026-11-13T00:00:00+00:00",
        git_sha="abc123",
        pr="16",
    )
    by_metric = {r.metric: r for r in records}
    assert all(r.simulated and r.pr == "16" and r.seed == "11" for r in records)
    assert by_metric["sim_driver_duplicate_share"].value == pytest.approx(40 / prepared.sent)
    assert by_metric["sim_driver_duplicate_share"].metric_id == "M9a"
    assert by_metric["sim_driver_schema_invalid_share"].value == pytest.approx(4 / prepared.sent)
    assert by_metric["sim_driver_reconcile_failures"].value == 0
    assert by_metric["sim_driver_readout_estimate_abs_diff"].value == 0.0
    assert by_metric["sim_driver_ingest_throughput"].value == pytest.approx(prepared.sent / 2.0)
    assert by_metric["sim_driver_ingest_throughput"].unit == "events/s"
    timed = Tally.from_dict({**tally.to_dict(), "send_seconds": 0.5})
    timed_records = to_run_records(
        prepared,
        timed,
        rec,
        analyze(prepared, rows),
        vus=50,
        load_seconds=2.0,
        run_at="2026-11-13T00:00:00+00:00",
        git_sha="abc123",
    )
    throughput = next(r for r in timed_records if r.metric == "sim_driver_ingest_throughput")
    assert throughput.value == pytest.approx(prepared.sent / 0.5), "spawning time excluded"
    assert by_metric["sim_driver_peak_concurrent_vus"].value == 1
    assert by_metric["sim_driver_peak_concurrent_vus"].unit == "users"
    assert all("virtual users" in r.notes and "locust_vus=50" in r.notes for r in records)


def test_cli_defaults_to_1k_virtual_users_on_1k_locust_users():
    args = build_parser().parse_args([])
    assert (args.users, args.vus) == (1000, 1000)
    assert args.dry_run is False


def test_cli_refuses_a_remote_database_before_starting_anything():
    from simkit.driver.run import main

    with pytest.raises(SystemExit) as exc:
        main(["--mongo-uri", "mongodb+srv://u:p@cluster0.example.net/travelplan_sim"])
    assert exc.value.code == 2


def _fake_load(*, lose_event=False, peak=None, flip_variant=False):
    """Stands in for the live stack in main(): FakeIngest instead of backend + Locust + Mongo."""

    def load(args, prepared, work):
        fake = FakeIngest()
        tally = Tally()
        for script in prepared.scripts:
            send_script(lambda b: (200, fake.ingest(list(b))), script, tally)
        tally.spawned_users = args.vus
        tally.peak_active = min(args.vus, len(prepared.scripts)) if peak is None else peak
        if lose_event:
            fake.stored.pop(next(iter(fake.stored)))
        if flip_variant:  # every count still agrees; only the readout table changes
            for event in fake.stored.values():
                if event["name"] == "experiment_exposure":
                    props = event["properties"]
                    other = "control" if props["variant"] == "treatment" else "treatment"
                    event["properties"] = {**props, "variant": other}
        fake.export(work / "export")
        counts = (len(fake.stored), len(fake.quarantine))
        return tally, 1.0, counts, read_export(work / "export")

    return load


MAIN_ARGS = ["--users", "60", "--days", "10", "--vus", "4", "--duplicate", "5", "--dry-run"]


def test_main_exits_0_only_when_every_check_passes(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(run_module, "_load", _fake_load())
    assert run_module.main([*MAIN_ARGS, "--work-dir", str(tmp_path)]) == 0
    assert "FAIL" not in capsys.readouterr().out


@pytest.mark.parametrize(
    ("fake", "failed"),
    [
        (_fake_load(lose_event=True), "stored events = accepted"),
        (_fake_load(peak=2), "peak concurrent virtual users = min(vus, scripts)"),
        (_fake_load(flip_variant=True), "export table = simulated-events table"),
    ],
)
def test_main_exits_1_when_a_check_fails(monkeypatch, tmp_path, capsys, fake, failed):
    monkeypatch.setattr(run_module, "_load", fake)
    assert run_module.main([*MAIN_ARGS, "--work-dir", str(tmp_path)]) == 1
    assert f"FAIL {failed}" in capsys.readouterr().out


def test_main_does_not_append_rows_on_a_dry_run(monkeypatch, tmp_path):
    runs = tmp_path / "runs.csv"
    monkeypatch.setattr(run_module, "_load", _fake_load())
    run_module.main([*MAIN_ARGS, "--work-dir", str(tmp_path), "--runs-csv", str(runs)])
    assert not runs.exists()
