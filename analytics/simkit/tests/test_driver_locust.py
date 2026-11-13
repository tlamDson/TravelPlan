"""Locust runs as its own process (it monkey-patches the interpreter with gevent), so these
tests start it against an in-process fake ingest instead of importing it here."""

import json
from datetime import date

from simkit.driver.client import Tally
from simkit.driver.plan import build_plan, write_plan
from simkit.driver.stack import run_locust
from simkit.faults import inject_faults
from simkit.generator import simulate

from fake_ingest import FakeIngest, serve


def _run(tmp_path, fake, vus):
    sim = simulate(seed=3, users=40, days=3, start=date(2026, 11, 1))
    faulted = inject_faults(sim.events, {"duplicate": 10}, seed=3)
    scripts = build_plan(faulted.events)
    plan, tally_path = tmp_path / "plan.json", tmp_path / "tally.json"
    write_plan(scripts, plan)
    server = serve(fake)
    try:
        host = f"http://127.0.0.1:{server.server_address[1]}"
        proc = run_locust(plan, tally_path, host, vus=vus, spawn_rate=vus, run_time="60s")
    finally:
        server.shutdown()
    tally = Tally.from_dict(json.loads(tally_path.read_text(encoding="utf-8")))
    return proc, tally, scripts, faulted


def test_locust_users_send_every_script_once_and_stop(tmp_path):
    fake = FakeIngest()
    proc, tally, scripts, faulted = _run(tmp_path, fake, vus=8)
    assert proc.returncode == 0, proc.stderr[-2000:]
    assert tally.scripts == len(scripts)
    assert tally.received == len(faulted.events)
    assert tally.counts() == faulted.expected_ingest()
    assert len(fake.stored) == tally.accepted
    assert tally.failed_batches == 0


def test_a_5xx_is_retried_with_the_same_event_ids(tmp_path):
    fake = FakeIngest(fail_first=3)
    proc, tally, _, faulted = _run(tmp_path, fake, vus=2)
    assert tally.retries == 3
    assert tally.counts() == faulted.expected_ingest()
