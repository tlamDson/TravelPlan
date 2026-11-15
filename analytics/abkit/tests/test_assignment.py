import json
from pathlib import Path

import pytest

from abkit.assignment import (
    BUCKET_COUNT,
    HOLDOUT_VARIANT,
    VECTORS_PATH,
    ExperimentDefinition,
    assign_variant,
    compute_bucket,
    load_vectors,
    parse_definition,
    variant_for_bucket,
)

HOLDOUT_DEF = {
    "key": "vector-holdout",
    "salt": "9f3c",
    "holdoutBuckets": 1000,
    "variants": [
        {"key": "control", "weight": 3000},
        {"key": "a", "weight": 3000},
        {"key": "b", "weight": 3000},
    ],
}


def test_vectors_path_points_at_the_shared_fixture(repo_root: Path) -> None:
    assert repo_root / "packages/shared/fixtures/assignment-vectors.json" == VECTORS_PATH


def test_every_shared_vector_matches_python_assignment() -> None:
    fixture = load_vectors()
    assert len(fixture.vectors) == 10_000
    mismatches = [
        v
        for v in fixture.vectors
        if assign_variant(fixture.experiments[v.experiment_key], v.user_id) != (v.bucket, v.variant)
    ]
    assert mismatches == []


def test_vectors_cover_all_experiments_and_the_holdout() -> None:
    fixture = load_vectors()
    assert set(fixture.experiments) == {"vector-ab", "vector-holdout", "vector-uneven"}
    assert {v.experiment_key for v in fixture.vectors} == set(fixture.experiments)
    assert HOLDOUT_VARIANT in {v.variant for v in fixture.vectors}


def test_compute_bucket_hashes_utf8_user_ids() -> None:
    assert compute_bucket("s1", "vector-ab", "người-dùng-1") == 9601


def test_compute_bucket_stays_in_range() -> None:
    buckets = {compute_bucket("salt", "exp", f"user_{i}") for i in range(2000)}
    assert min(buckets) >= 0
    assert max(buckets) < BUCKET_COUNT


@pytest.mark.parametrize(
    ("bucket", "variant"),
    [
        (0, "holdout"),
        (999, "holdout"),
        (1000, "control"),
        (3999, "control"),
        (4000, "a"),
        (6999, "a"),
        (7000, "b"),
        (9999, "b"),
    ],
)
def test_variant_for_bucket_walks_cumulative_weights(bucket: int, variant: str) -> None:
    assert variant_for_bucket(parse_definition(HOLDOUT_DEF), bucket) == variant


@pytest.mark.parametrize("bucket", [-1, BUCKET_COUNT, 1.5])
def test_variant_for_bucket_rejects_out_of_range(bucket: float) -> None:
    with pytest.raises(ValueError, match="bucket"):
        variant_for_bucket(parse_definition(HOLDOUT_DEF), bucket)  # type: ignore[arg-type]


def test_parse_definition_returns_frozen_definition() -> None:
    definition = parse_definition(HOLDOUT_DEF)
    assert isinstance(definition, ExperimentDefinition)
    assert definition.holdout_buckets == 1000
    assert [v.key for v in definition.variants] == ["control", "a", "b"]
    with pytest.raises(AttributeError):
        definition.salt = "other"  # type: ignore[misc]


@pytest.mark.parametrize(
    ("patch", "message"),
    [
        ({"holdoutBuckets": 999}, "must equal 10000"),
        ({"holdoutBuckets": -1}, "holdoutBuckets"),
        ({"holdoutBuckets": BUCKET_COUNT}, "holdoutBuckets"),
        ({"salt": "a:b"}, "salt"),
        ({"salt": ""}, "salt"),
        ({"key": "Bad Key"}, "key"),
        ({"variants": [{"key": "control", "weight": 9000}]}, "at least 2"),
        (
            {"holdoutBuckets": 0, "variants": [{"key": "x", "weight": 5000}] * 2},
            "unique",
        ),
        (
            {
                "holdoutBuckets": 0,
                "variants": [{"key": "holdout", "weight": 5000}, {"key": "x", "weight": 5000}],
            },
            "reserved",
        ),
        (
            {
                "holdoutBuckets": 0,
                "variants": [{"key": "x", "weight": 10000}, {"key": "y", "weight": 0}],
            },
            "weight",
        ),
        ({"holdoutBuckets": True}, "holdoutBuckets"),
        ({"extra": 1}, "unknown"),
    ],
)
def test_parse_definition_rejects_what_the_shared_schema_rejects(patch: dict, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        parse_definition({**HOLDOUT_DEF, **patch})


def _write_fixture(tmp_path: Path, **overrides: object) -> Path:
    raw = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    raw["vectors"] = raw["vectors"][:3]
    raw.update(overrides)
    path = tmp_path / "vectors.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    return path


def test_load_vectors_rejects_a_different_bucket_count(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="bucketCount"):
        load_vectors(_write_fixture(tmp_path, bucketCount=100))


def test_load_vectors_rejects_unknown_experiment_rows(tmp_path: Path) -> None:
    bad_row = {"experimentKey": "ghost", "userId": "u", "bucket": 1, "variant": "control"}
    with pytest.raises(ValueError, match="ghost"):
        load_vectors(_write_fixture(tmp_path, vectors=[bad_row]))


def test_load_vectors_rejects_malformed_rows(tmp_path: Path) -> None:
    bad_row = {"experimentKey": "vector-ab", "userId": "u", "bucket": "1", "variant": "control"}
    with pytest.raises(ValueError, match="bucket"):
        load_vectors(_write_fixture(tmp_path, vectors=[bad_row]))
