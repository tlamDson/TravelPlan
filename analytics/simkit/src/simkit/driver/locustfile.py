"""Locust users that replay SIMULATED virtual users' events through the real ingest.

Run by ``simkit.driver.stack.run_locust`` (never imported by the driver: Locust monkey-patches
the interpreter with gevent). Reads the plan from ``SIMKIT_PLAN`` and writes the tally to
``SIMKIT_TALLY`` when Locust quits. Each Locust user takes the next virtual user's script, posts
its batches in order, and takes another until none are left; the last one stops the run.
"""

from __future__ import annotations

import json
import os
from collections import deque
from pathlib import Path

from locust import HttpUser, constant, events, task
from locust.exception import StopUser

from simkit.driver.client import Tally, send_script
from simkit.driver.plan import read_plan
from simkit.driver.stack import INGEST_PATH

SCRIPTS = read_plan(os.environ["SIMKIT_PLAN"])
QUEUE = deque(SCRIPTS)
TALLY = Tally()


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

    @task
    def replay_one_virtual_user(self):
        if not QUEUE:
            raise StopUser()
        send_script(self._post, QUEUE.popleft(), TALLY)
        if TALLY.scripts == len(SCRIPTS):
            self.environment.runner.quit()


@events.quitting.add_listener
def _write_tally(environment, **_kwargs):
    Path(os.environ["SIMKIT_TALLY"]).write_text(json.dumps(TALLY.to_dict()), encoding="utf-8")
