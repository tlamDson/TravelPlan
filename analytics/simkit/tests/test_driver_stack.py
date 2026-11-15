import gzip
import json

import pytest

from simkit.driver.exported import read_export
from simkit.driver.stack import (
    SIM_DB_PREFIX,
    backend_env,
    check_local_mongo_uri,
    export_command,
    sim_mongo_uri,
)


def test_default_uri_is_the_local_docker_mongo_and_a_sim_database():
    uri = sim_mongo_uri()
    assert check_local_mongo_uri(uri) == "travelplan_sim"
    assert uri.startswith("mongodb://") and "localhost:27017" in uri


@pytest.mark.parametrize(
    "uri",
    [
        "mongodb+srv://u:p@cluster0.abcde.mongodb.net/travelplan_sim",
        "mongodb://u:p@db.example.com:27017/travelplan_sim",
        "mongodb://u:p@localhost:27017/travelplan_db?authSource=admin",
        "mongodb://u:p@localhost:27017/travelplan_test",
        "mongodb://u:p@localhost:27017/",
        "mongodb://u:p@localhost:27017,db.example.com:27017/travelplan_sim",
    ],
)
def test_refuses_anything_but_a_local_sim_database(uri):
    with pytest.raises(ValueError):
        check_local_mongo_uri(uri)


def test_accepts_loopback_hosts_and_any_sim_prefixed_database():
    assert SIM_DB_PREFIX == "travelplan_sim"
    for host in ("localhost", "127.0.0.1", "[::1]"):
        uri = f"mongodb://u:p@{host}:27017/travelplan_sim_load?authSource=admin"
        assert check_local_mongo_uri(uri) == "travelplan_sim_load"


def test_backend_env_turns_on_the_sim_route_with_dummy_keys_only():
    base = {"PATH": "/bin", "MONGO_URI": "mongodb+srv://real", "SENTRY_DSN": "https://real"}
    env = backend_env(sim_mongo_uri(), port=3999, hash_secret="k" * 40, base=base)
    assert env["PATH"] == "/bin"
    assert env["MONGO_URI"] == sim_mongo_uri()
    assert env["NODE_ENV"] == "development"
    assert env["PORT"] == "3999"
    assert env["ANALYTICS_ENABLED"] == "true"
    assert env["ANALYTICS_SIM_INGEST"] == "true"
    assert env["ANALYTICS_HASH_SECRET"] == "k" * 40
    assert env["EXPERIMENTS_ENABLED"] == ""
    assert env["SENTRY_DSN"] == ""
    assert env["REDIS_URL"] == ""
    # Required by config/env.ts; never a real key (nothing here is billed or verified).
    for name in ("CLERK_SECRET_KEY", "GEMINI_API_KEY", "STRIPE_SECRET_KEY"):
        assert "dummy" in env[name]
    assert env["CLERK_PUBLISHABLE_KEY"].startswith("pk_test_")
    assert env["CLERK_WEBHOOK_SIGNING_SECRET"].startswith("whsec_")


def test_backend_env_refuses_a_short_hash_secret_or_a_remote_database():
    with pytest.raises(ValueError, match="hash_secret"):
        backend_env(sim_mongo_uri(), port=3999, hash_secret="short", base={})
    with pytest.raises(ValueError):
        backend_env("mongodb://u:p@db.example.com/travelplan_sim", 3999, "k" * 40, base={})


def test_export_command_runs_the_backend_export_script_for_one_day(tmp_path):
    cmd = export_command("2026-11-03", tmp_path)
    assert cmd[1:] == [
        "run",
        "analytics:export",
        "-w",
        "backend",
        "--",
        "--day=2026-11-03",
        f"--out={tmp_path}",
    ]


def test_read_export_reads_every_day_file_in_day_order(tmp_path):
    for day, ids in (("2026-11-02", ["c"]), ("2026-11-01", ["a", "b"])):
        with gzip.open(tmp_path / f"events-{day}.jsonl.gz", "wt", encoding="utf-8") as f:
            f.writelines(json.dumps({"eventId": i}) + "\n" for i in ids)
    (tmp_path / "events-2026-11-03.jsonl.gz.tmp").write_bytes(b"half written")
    assert [r["eventId"] for r in read_export(tmp_path)] == ["a", "b", "c"]
