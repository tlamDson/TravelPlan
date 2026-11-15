"""``main()`` with its real orchestration (``_load``) and only the live stack faked.

The backend process, Locust, Mongo and ``npm run analytics:export`` are replaced by a
``FakeIngest``; everything between them (order of the steps, which days are exported, where,
with which environment, what is read back) is the driver's own code and runs for real.
"""

import gzip
import json
from types import SimpleNamespace

import pytest
from fake_ingest import FakeIngest

from simkit.driver import run as run_module
from simkit.driver.client import Tally, send_script
from simkit.driver.plan import read_plan
from simkit.driver.stack import sim_mongo_uri

ARGS = ["--users", "60", "--days", "10", "--vus", "4", "--duplicate", "5", "--dry-run"]


class FakeStack:
    def __init__(self, monkeypatch, *, skip_day=None, drop_from_day=None):
        self.fake = FakeIngest()
        self.steps: list[str] = []
        self.exports: list[tuple] = []
        self.backend_env: dict | None = None
        self.skip_day = skip_day  # index of a day whose export call writes nothing
        self.drop_from_day = drop_from_day  # index of a day whose file loses its first row
        for name in ("reset_sim_db", "wait_healthy", "wait_unique_event_index"):
            monkeypatch.setattr(run_module, name, self._step(name))
        monkeypatch.setattr(run_module, "start_backend", self.start_backend)
        monkeypatch.setattr(run_module, "run_locust", self.run_locust)
        monkeypatch.setattr(run_module, "mongo_counts", self.mongo_counts)
        monkeypatch.setattr("simkit.driver.daily_export.export_day", self.export_day)

    def _step(self, name):
        return lambda *args, **kwargs: self.steps.append(name)

    def start_backend(self, env, log_path):
        self.steps.append("start_backend")
        self.backend_env = dict(env)
        return SimpleNamespace(
            terminate=lambda: self.steps.append("stop_backend"), wait=lambda timeout: 0
        )

    def run_locust(self, plan, tally_path, host, *, vus, spawn_rate, run_time):
        self.steps.append("run_locust")
        scripts = read_plan(plan)
        tally = Tally()
        for script in scripts:
            send_script(lambda b: (200, self.fake.ingest(list(b))), script, tally)
        tally.spawned_users, tally.peak_active = vus, min(vus, len(scripts))
        tally_path.write_text(json.dumps(tally.to_dict()), encoding="utf-8")
        return SimpleNamespace(stdout="", stderr="")

    def mongo_counts(self, uri):
        self.steps.append("mongo_counts")
        return len(self.fake.stored), len(self.fake.quarantine)

    def export_day(self, day, out_dir, env):
        self.steps.append("export_day")
        index = len(self.exports)
        self.exports.append((day, out_dir, dict(env)))
        if index == self.skip_day:
            return
        (path,) = self.fake.export(out_dir, days=[day])
        if index == self.drop_from_day:
            with gzip.open(path, "rt", encoding="utf-8") as f:
                lines = f.readlines()
            with gzip.open(path, "wt", encoding="utf-8", newline="\n") as f:
                f.writelines(lines[1:])

    @property
    def stored_days(self) -> list[str]:
        return sorted({e["occurredAt"][:10] for e in self.fake.stored.values()})


def test_main_exports_every_day_of_the_run_and_reconciles_what_it_reads_back(
    monkeypatch, tmp_path, capsys
):
    stack = FakeStack(monkeypatch)
    assert run_module.main([*ARGS, "--work-dir", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "ok   exported rows = accepted" in out
    assert "ok   exported ids = accepted ids" in out
    assert "ok   export table = simulated-events table" in out
    days = [day for day, _, _ in stack.exports]
    assert len(days) > 1 and days == stack.stored_days, "one export per UTC day, in order"
    assert all(out_dir == tmp_path / "export" for _, out_dir, _ in stack.exports)


def test_main_exports_after_the_load_with_the_environment_the_backend_ran_with(
    monkeypatch, tmp_path
):
    stack = FakeStack(monkeypatch)
    run_module.main([*ARGS, "--work-dir", str(tmp_path)])
    assert stack.steps[:6] == [
        "reset_sim_db",
        "start_backend",
        "wait_healthy",
        "wait_unique_event_index",
        "run_locust",
        "stop_backend",
    ]
    assert stack.steps.index("export_day") > stack.steps.index("run_locust")
    env = stack.backend_env
    assert env["MONGO_URI"] == sim_mongo_uri()
    assert len(env["ANALYTICS_HASH_SECRET"]) >= 32
    # The export hashes ids with the secret the ingest used, from the same database.
    assert all(e == env for _, _, e in stack.exports)


def test_main_exits_1_when_a_day_file_comes_back_short(monkeypatch, tmp_path, capsys):
    FakeStack(monkeypatch, drop_from_day=1)
    assert run_module.main([*ARGS, "--work-dir", str(tmp_path)]) == 1
    assert "FAIL exported rows = accepted" in capsys.readouterr().out


def test_main_fails_when_a_day_is_not_exported(monkeypatch, tmp_path):
    stack = FakeStack(monkeypatch, skip_day=2)
    with pytest.raises(RuntimeError, match="events-"):
        run_module.main([*ARGS, "--work-dir", str(tmp_path)])
    assert len(stack.exports) == 3, "stops at the day that was not written"


def test_main_ignores_export_files_of_an_earlier_run_in_a_reused_work_dir(monkeypatch, tmp_path):
    stale = tmp_path / "export" / "events-2027-01-01.jsonl.gz"
    stale.parent.mkdir()
    with gzip.open(stale, "wt", encoding="utf-8") as f:
        f.write(json.dumps({"eventId": "stale", "name": "trip_saved"}) + "\n")
    FakeStack(monkeypatch)
    assert run_module.main([*ARGS, "--work-dir", str(tmp_path)]) == 0
    assert not stale.exists()
