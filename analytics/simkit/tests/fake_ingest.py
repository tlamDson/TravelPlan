"""A stand-in for the backend's sim ingest + daily export, used only by the driver tests.

It applies the G-event rules (``simkit.catalog``) plus the sim channel's ``sim-`` userId rule,
stores accepted events with HMAC'd ids like ``pseudonymize-event.ts``, and writes export files
in the ``export-row.ts`` shape. The live backend is covered by the backend integration test
``analytics-sim-ingest.integration.test.ts`` and by running ``python -m simkit.driver``.
"""

from __future__ import annotations

import copy
import gzip
import hashlib
import hmac
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from simkit.catalog import load_catalog

SECRET = b"fake-ingest-key-for-driver-tests-only"
PATH = "/api/analytics/sim/events"


def _hash(value: str, field: str | None = None) -> str:
    text = value if field is None else f"{field}:{value}"
    return hmac.new(SECRET, text.encode(), hashlib.sha256).hexdigest()


class FakeIngest:
    def __init__(self, fail_first: int = 0) -> None:
        self.catalog = load_catalog()
        self.stored: dict[str, dict] = {}
        self.quarantine: list[object] = []
        self.fail_first = fail_first  # answer 500 to the first N batches (retry test)
        self.lock = threading.Lock()

    def ingest(self, events: list) -> dict:
        with self.lock:
            fresh: dict[str, dict] = {}
            quarantined = in_batch = 0
            for event in events:
                user = event.get("userId") if isinstance(event, dict) else None
                bad = self.catalog.classify(event) is not None
                if bad or (user is not None and not str(user).startswith("sim-")):
                    quarantined += 1
                    self.quarantine.append(event)
                    continue
                if event["eventId"] in fresh:
                    in_batch += 1
                    continue
                fresh[event["eventId"]] = copy.deepcopy(event)  # stored, not shared
            accepted = 0
            for event_id, event in fresh.items():
                if event_id not in self.stored:
                    self.stored[event_id] = event
                    accepted += 1
            return {
                "received": len(events),
                "accepted": accepted,
                "duplicates": in_batch + len(fresh) - accepted,
                "quarantined": quarantined,
            }

    def export(self, out_dir: Path) -> list[Path]:
        """``events-<day>.jsonl.gz`` per UTC day, rows shaped like export-row.ts."""
        by_day: dict[str, list[dict]] = {}
        for event in self.stored.values():
            row = {
                "eventId": event["eventId"],
                "schemaVersion": event["schemaVersion"],
                "name": event["name"],
                "occurredAt": event["occurredAt"],
                "receivedAt": "2026-11-13T00:00:00.000Z",
                "sessionId": _hash(event["sessionId"], "sessionId"),
                "userId": None if event["userId"] is None else _hash(event["userId"]),
                "source": event["source"],
                "properties": event["properties"],
            }
            by_day.setdefault(event["occurredAt"][:10], []).append(row)
        out_dir.mkdir(parents=True, exist_ok=True)
        files = []
        for day, rows in sorted(by_day.items()):
            path = out_dir / f"events-{day}.jsonl.gz"
            with gzip.open(path, "wt", encoding="utf-8", newline="\n") as f:
                f.writelines(json.dumps(r) + "\n" for r in rows)
            files.append(path)
        return files


def serve(fake: FakeIngest) -> ThreadingHTTPServer:
    """Serve ``fake`` on a free localhost port, in a daemon thread."""

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802 (http.server API)
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            with fake.lock:
                fail = fake.fail_first > 0
                fake.fail_first -= int(fail)
            if self.path != PATH:
                status, payload = 404, {"success": False}
            elif fail:
                status, payload = 500, {"success": False}
            else:
                status, payload = 200, fake.ingest(body["events"])
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *args: object) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
