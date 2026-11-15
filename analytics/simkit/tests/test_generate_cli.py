import json
from pathlib import Path

import pyarrow.parquet as pq
import pytest

from simkit.catalog import replay_ingest
from simkit.export import read_jsonl
from simkit.generate import DEFAULT_OUT, main

EXPERIMENT = {
    "definition": {
        "key": "save-trip-cta-v1",
        "salt": "sim",
        "holdoutBuckets": 0,
        "variants": [{"key": "control", "weight": 5000}, {"key": "treatment", "weight": 5000}],
    },
    "relativeLift": {"treatment": {"planner": 0.03, "power": 0.06}},
}


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_default_output_is_git_ignored_analytics_data(repo_root: Path) -> None:
    assert repo_root / "analytics/data/simulated" == DEFAULT_OUT


def test_writes_events_users_and_manifest(tmp_path: Path, capsys) -> None:
    code = main(["--seed", "3", "--users", "25", "--days", "2", "--out", str(tmp_path)])
    assert code == 0
    events = read_jsonl(tmp_path / "events.jsonl")
    users = read_jsonl(tmp_path / "users.jsonl")
    manifest = _read(tmp_path / "manifest.json")
    assert len(users) == 25
    assert set(users[0]) == {
        "userId",
        "persona",
        "firstActiveDate",
        "variant",
        "bucket",
        "exposureLogged",
        "firstExposedAt",
    }
    assert manifest["simulated"] is True
    assert manifest["params"] == {"seed": 3, "users": 25, "days": 2, "start": "2026-11-01"}
    assert manifest["experiment"] is None
    assert manifest["expectedIngest"] == replay_ingest(events).counts()
    assert sum(manifest["personas"].values()) == 25
    assert "simulated events" in capsys.readouterr().out


def test_experiment_and_faults_end_up_in_the_manifest(tmp_path: Path) -> None:
    config = tmp_path / "experiment.json"
    config.write_text(json.dumps(EXPERIMENT), encoding="utf-8")
    out = tmp_path / "out"
    args = ["--users", "60", "--days", "3", "--experiment", str(config), "--out", str(out)]
    assert main([*args, "--duplicate", "2", "--wrong-source", "1", "--missing-field", "2"]) == 0
    manifest = _read(out / "manifest.json")
    events = read_jsonl(out / "events.jsonl")
    assert manifest["experiment"]["definition"]["key"] == "save-trip-cta-v1"
    assert manifest["experiment"]["relativeLift"] == EXPERIMENT["relativeLift"]
    assert set(manifest["variants"]) == {"control", "treatment"}
    assert manifest["counts"]["duplicate"] == 2
    assert manifest["expectedIngest"] == replay_ingest(events).counts()
    assert manifest["expectedIngest"]["quarantined"] == 3


def test_parquet_flag_writes_parquet(tmp_path: Path) -> None:
    assert main(["--users", "10", "--days", "1", "--parquet", "--out", str(tmp_path)]) == 0
    events = read_jsonl(tmp_path / "events.jsonl")
    assert pq.read_table(tmp_path / "events.parquet").num_rows == len(events)


@pytest.mark.parametrize(
    "argv",
    [
        ["--users", "-1"],
        ["--users", "5", "--wrong-type", "100000"],
        ["--users", "5", "--parquet", "--wrong-type", "1"],
    ],
)
def test_bad_arguments_exit_with_code_2(tmp_path: Path, argv) -> None:
    with pytest.raises(SystemExit) as exc:
        main([*argv, "--out", str(tmp_path)])
    assert exc.value.code == 2


def test_bad_experiment_file_exits_with_code_2(tmp_path: Path) -> None:
    config = tmp_path / "experiment.json"
    config.write_text(json.dumps({**EXPERIMENT, "target": "nope"}), encoding="utf-8")
    with pytest.raises(SystemExit) as exc:
        main(["--experiment", str(config), "--out", str(tmp_path)])
    assert exc.value.code == 2
