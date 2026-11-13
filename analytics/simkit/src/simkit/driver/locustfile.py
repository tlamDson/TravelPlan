"""Locust users that replay SIMULATED virtual users' events through the real ingest.

Run by ``simkit.driver.stack.run_locust`` (never imported by the driver: Locust monkey-patches
the interpreter with gevent). Reads the plan from ``SIMKIT_PLAN`` and writes the tally to
``SIMKIT_TALLY`` when Locust quits. Each Locust user takes the next virtual user's script, posts
its batches in order, and takes another until none are left; the last one stops the run.

No user starts before Locust reports every user spawned (``spawning_complete``), so all of them
are sending at once instead of the first ones finishing the work while the rest still spawn.
The tally records the spawned count and the peak of users sending at the same moment, and the
driver fails the run unless they reach the requested concurrency (``simkit.driver.reconcile``).
"""

from __future__ import annotations

import json
import os
import time
from collections import deque
from pathlib import Path

from gevent.event import Event
from locust import HttpUser, constant, events, task
from locust.exception import StopUser

from simkit.driver.client import Tally, send_script
from simkit.driver.plan import read_plan
from simkit.driver.stack import INGEST_PATH

SCRIPTS = read_plan(os.environ["SIMKIT_PLAN"])
QUEUE = deque(SCRIPTS)
TALLY = Tally()
ALL_SPAWNED = Event()
ACTIVE = 0  # Locust users inside send_script right now (one gevent thread: no lock needed)
RELEASED_AT = [0.0]  # perf_counter() when every user had spawned


@events.spawning_complete.add_listener
def _all_spawned(user_count, **_kwargs):
    TALLY.spawned_users = user_count
    RELEASED_AT[0] = time.perf_counter()
    ALL_SPAWNED.set()


class SimulatedVirtualUser(HttpUser):
    wait_time = constant(0)

    def _post(self, batch):
        with self.client.post(
            INGEST_PATH, json={"events": list(batch)}, catch_response=True, name=INGEST_PATH
        ) as res:
            if res.status_code != 200:
                res.failure(f"HTTP {res.status_code}")
            try:
                body = res.json()
            except ValueError:
                body = None
            if res.status_code == 0:  # connection error: let send_script retry it
                raise ConnectionError(str(res.error))
            return res.status_code, body

    def on_start(self):
        ALL_SPAWNED.wait()

    @task
    def replay_one_virtual_user(self):
        global ACTIVE
        if not QUEUE:
            raise StopUser()
        script = QUEUE.popleft()
        ACTIVE += 1
        TALLY.peak_active = max(TALLY.peak_active, ACTIVE)
        try:
            send_script(self._post, script, TALLY)
        finally:
            ACTIVE -= 1
        if TALLY.scripts == len(SCRIPTS):
            TALLY.send_seconds = time.perf_counter() - RELEASED_AT[0]
            self.environment.runner.quit()


@events.quitting.add_listener
def _write_tally(environment, **_kwargs):
    Path(os.environ["SIMKIT_TALLY"]).write_text(json.dumps(TALLY.to_dict()), encoding="utf-8")
