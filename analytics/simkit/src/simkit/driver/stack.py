"""The local stack the driver runs against: docker Mongo/Redis, the real backend, Locust.

Everything here is local and free: the backend is started with dummy keys (nothing is billed or
verified, like the backend's unit-test env), ``ANALYTICS_SIM_INGEST=true`` and a database whose
name starts with ``travelplan_sim`` on a loopback host. Anything else is refused.
"""

from __future__ import annotations

import base64
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Mapping
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[5]
BACKEND_DIR = REPO_ROOT / "backend"
LOCUSTFILE = Path(__file__).with_name("locustfile.py")
SIM_DB_PREFIX = "travelplan_sim"
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
INGEST_PATH = "/api/analytics/sim/events"
# docker-compose.yml dev credentials, as in backend/src/test/integration-setup.ts.
_DEV_MONGO_AUTH = "travelplan_admin:dev_password_change_in_prod"
_DEV_REDIS_PASSWORD = "dev_redis_password"
MIN_HASH_SECRET = 32  # ANALYTICS_HASH_SECRET_MIN_LENGTH in pseudonymize.ts


def sim_mongo_uri(host: str = "localhost", port: int = 27017, db: str = SIM_DB_PREFIX) -> str:
    return f"mongodb://{_DEV_MONGO_AUTH}@{host}:{port}/{db}?authSource=admin"


def _hostname(host_port: str) -> str:
    if host_port.startswith("["):
        return host_port[1 : host_port.index("]")]
    return host_port.rsplit(":", 1)[0] if ":" in host_port else host_port


def check_local_mongo_uri(uri: str) -> str:
    """The database name of ``uri``; raises unless it is a sim database on a loopback host."""
    if not uri.startswith("mongodb://"):
        raise ValueError("the driver only writes to a local mongodb:// database")
    rest = uri.removeprefix("mongodb://")
    authority, _, path = rest.partition("/")
    hosts = authority.rsplit("@", 1)[-1].split(",")
    if any(_hostname(h) not in LOCAL_HOSTS for h in hosts):
        raise ValueError(f"the driver only writes to localhost, got hosts {hosts}")
    db = path.split("?", 1)[0]
    if db != SIM_DB_PREFIX and not db.startswith(f"{SIM_DB_PREFIX}_"):
        raise ValueError(f"the database name must start with {SIM_DB_PREFIX!r}, got {db!r}")
    return db


def backend_env(
    mongo_uri: str, port: int, hash_secret: str, base: Mapping[str, str] | None = None
) -> dict[str, str]:
    """Environment of the backend process (and its export script) for a load run."""
    check_local_mongo_uri(mongo_uri)
    if len(hash_secret) < MIN_HASH_SECRET:
        raise ValueError(f"hash_secret must be at least {MIN_HASH_SECRET} characters")
    publishable = base64.b64encode(b"clerk.example.com$").decode()
    webhook = base64.b64encode(b"simkit-load-driver-dummy-webhook").decode()
    # Explicit values win over backend/.env (dotenv never overrides a set variable).
    return {
        **(os.environ if base is None else base),
        "NODE_ENV": "development",
        "APP_ENV": "",
        "PORT": str(port),
        "MONGO_URI": mongo_uri,
        "REDIS_URL": "",
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379",
        "REDIS_PASSWORD": _DEV_REDIS_PASSWORD,
        "CLERK_SECRET_KEY": "sk_test_dummy_simkit_driver",
        "CLERK_PUBLISHABLE_KEY": f"pk_test_{publishable}",
        "CLERK_WEBHOOK_SIGNING_SECRET": f"whsec_{webhook}",
        "GEMINI_API_KEY": "dummy-simkit-driver",
        "STRIPE_SECRET_KEY": "sk_test_dummy_simkit_driver",
        "SENTRY_DSN": "",
        "ANALYTICS_ENABLED": "true",
        "ANALYTICS_SIM_INGEST": "true",
        "ANALYTICS_HASH_SECRET": hash_secret,
        "EXPERIMENTS_ENABLED": "",
    }


def _tool(name: str) -> str:
    return shutil.which(name) or name


def start_backend(env: Mapping[str, str], log_path: Path) -> subprocess.Popen:
    """``node --import tsx src/index.ts`` in backend/ (one process, so terminate() stops it)."""
    log = open(log_path, "w", encoding="utf-8")  # noqa: SIM115 (closed with the process)
    return subprocess.Popen(
        [_tool("node"), "--import", "tsx", "src/index.ts"],
        cwd=BACKEND_DIR,
        env=dict(env),
        stdout=log,
        stderr=subprocess.STDOUT,
    )


def wait_healthy(base_url: str, proc: subprocess.Popen, timeout: float = 120.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"the backend exited with code {proc.returncode} while booting")
        try:
            with urllib.request.urlopen(f"{base_url}/health", timeout=2) as res:
                if res.status == 200:
                    return
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.5)
    raise TimeoutError(f"{base_url}/health did not answer within {timeout:.0f}s")


def _mongo(uri: str):
    from pymongo import MongoClient  # [load] extra

    db = check_local_mongo_uri(uri)
    return MongoClient(uri, serverSelectionTimeoutMS=5000), db


def reset_sim_db(uri: str) -> None:
    """Drop the (local, sim-only) database so a run starts from nothing."""
    client, db = _mongo(uri)
    with client:
        client.drop_database(db)


def wait_unique_event_index(uri: str, timeout: float = 60.0) -> None:
    """Dedupe relies on the unique eventId index Mongoose builds after boot; wait for it."""
    client, db = _mongo(uri)
    deadline = time.monotonic() + timeout
    with client:
        while time.monotonic() < deadline:
            info = client[db]["analytics_events"].index_information()
            if any(i.get("unique") and i["key"] == [("eventId", 1)] for i in info.values()):
                return
            time.sleep(0.5)
    raise TimeoutError("analytics_events has no unique eventId index yet")


def mongo_counts(uri: str) -> tuple[int, int]:
    """Documents in ``analytics_events`` and ``analytics_quarantine``."""
    client, db = _mongo(uri)
    with client:
        return (
            client[db]["analytics_events"].count_documents({}),
            client[db]["analytics_quarantine"].count_documents({}),
        )


def export_command(day: str, out_dir: Path) -> list[str]:
    return [
        _tool("npm"),
        "run",
        "analytics:export",
        "-w",
        "backend",
        "--",
        f"--day={day}",
        f"--out={out_dir}",
    ]


def export_day(day: str, out_dir: Path, env: Mapping[str, str]) -> None:
    subprocess.run(
        export_command(day, out_dir),
        cwd=REPO_ROOT,
        env=dict(env),
        check=True,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
    )


def run_locust(
    plan: Path, tally: Path, host: str, *, vus: int, spawn_rate: float, run_time: str
) -> subprocess.CompletedProcess:
    """Headless Locust in its own process (gevent monkey-patches its interpreter)."""
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "locust",
            "-f",
            str(LOCUSTFILE),
            "--headless",
            "--users",
            str(vus),
            "--spawn-rate",
            str(spawn_rate),
            "--run-time",
            run_time,
            "--host",
            host,
            "--only-summary",
            "--loglevel",
            "WARNING",
        ],
        env={**os.environ, "SIMKIT_PLAN": str(plan), "SIMKIT_TALLY": str(tally)},
        capture_output=True,
        encoding="utf-8",
        errors="replace",
    )
