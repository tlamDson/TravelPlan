"""Deterministic variant assignment, the Python twin of the server's.

Mirrors ``backend/src/features/experiments/services/assignment.ts``::

    bucket = int.from_bytes(sha256(f"{salt}:{key}:{user_id}").digest()[:8], "big") % 10_000

Buckets below ``holdout_buckets`` get the holdout; the rest walk the variants'
cumulative integer weights in declared order. ``parse_definition`` applies the
rules of ``experimentDefinitionSchema`` in ``packages/shared``, and
``packages/shared/fixtures/assignment-vectors.json`` pins 10,000 results that
both languages must reproduce.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

BUCKET_COUNT = 10_000
HOLDOUT_VARIANT = "holdout"
VECTORS_PATH = (
    Path(__file__).resolve().parents[4] / "packages/shared/fixtures/assignment-vectors.json"
)

_SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
_SALT = re.compile(r"^[^:]+$")
_DEFINITION_FIELDS = {"key", "salt", "holdoutBuckets", "variants"}


@dataclass(frozen=True)
class Variant:
    key: str
    weight: int


@dataclass(frozen=True)
class ExperimentDefinition:
    key: str
    salt: str
    holdout_buckets: int
    variants: tuple[Variant, ...]


@dataclass(frozen=True)
class AssignmentVector:
    experiment_key: str
    user_id: str
    bucket: int
    variant: str


@dataclass(frozen=True)
class VectorFixture:
    experiments: dict[str, ExperimentDefinition]
    vectors: tuple[AssignmentVector, ...]


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _slug(value: object, field: str) -> str:
    if not isinstance(value, str) or len(value) > 64 or not _SLUG.match(value):
        raise ValueError(f"{field} must be a lowercase slug of at most 64 chars, got {value!r}")
    return value


def _int_in(value: object, field: str, low: int, high: int) -> int:
    if not _is_int(value) or not low <= value <= high:  # type: ignore[operator]
        raise ValueError(f"{field} must be an integer in {low}..{high}, got {value!r}")
    return value  # type: ignore[return-value]


def parse_definition(raw: Mapping[str, Any]) -> ExperimentDefinition:
    """Validate a JSON experiment definition (camelCase, as in packages/shared)."""
    unknown = set(raw) - _DEFINITION_FIELDS
    if unknown:
        raise ValueError(f"unknown experiment fields: {sorted(unknown)}")
    key = _slug(raw.get("key"), "key")
    salt = raw.get("salt")
    if not isinstance(salt, str) or not 1 <= len(salt) <= 64 or not _SALT.match(salt):
        raise ValueError(f"salt must be 1..64 chars without ':', got {salt!r}")
    holdout = _int_in(raw.get("holdoutBuckets"), "holdoutBuckets", 0, BUCKET_COUNT - 1)
    raw_variants = raw.get("variants")
    if not isinstance(raw_variants, list) or len(raw_variants) < 2:
        raise ValueError(f"experiment {key}: variants must be a list of at least 2")
    variants = tuple(
        Variant(
            key=_slug(v.get("key"), "variant key"),
            weight=_int_in(v.get("weight"), "variant weight", 1, BUCKET_COUNT),
        )
        for v in raw_variants
    )
    keys = [v.key for v in variants]
    if len(set(keys)) != len(keys):
        raise ValueError(f"experiment {key}: variant keys must be unique")
    if HOLDOUT_VARIANT in keys:
        raise ValueError(f'experiment {key}: "{HOLDOUT_VARIANT}" is reserved')
    if sum(v.weight for v in variants) + holdout != BUCKET_COUNT:
        raise ValueError(
            f"experiment {key}: variant weights + holdoutBuckets must equal {BUCKET_COUNT}"
        )
    return ExperimentDefinition(key=key, salt=salt, holdout_buckets=holdout, variants=variants)


def compute_bucket(salt: str, experiment_key: str, user_id: str) -> int:
    digest = hashlib.sha256(f"{salt}:{experiment_key}:{user_id}".encode()).digest()
    return int.from_bytes(digest[:8], "big") % BUCKET_COUNT


def variant_for_bucket(definition: ExperimentDefinition, bucket: int) -> str:
    if not _is_int(bucket) or not 0 <= bucket < BUCKET_COUNT:
        raise ValueError(f"bucket {bucket!r} outside 0..{BUCKET_COUNT - 1}")
    if bucket < definition.holdout_buckets:
        return HOLDOUT_VARIANT
    upper = definition.holdout_buckets
    for variant in definition.variants:
        upper += variant.weight
        if bucket < upper:
            return variant.key
    raise ValueError(f"experiment {definition.key}: weights do not cover bucket {bucket}")


def assign_variant(definition: ExperimentDefinition, user_id: str) -> tuple[int, str]:
    """Return ``(bucket, variant)`` for one user."""
    bucket = compute_bucket(definition.salt, definition.key, user_id)
    return bucket, variant_for_bucket(definition, bucket)


def _parse_vector(row: Mapping[str, Any], experiments: Mapping[str, ExperimentDefinition]):
    key = row.get("experimentKey")
    if key not in experiments:
        raise ValueError(f"vector row names unknown experiment {key!r}")
    user_id = row.get("userId")
    if not isinstance(user_id, str) or not 1 <= len(user_id) <= 128:
        raise ValueError(f"vector row userId must be 1..128 chars, got {user_id!r}")
    variant = row.get("variant")
    if not isinstance(variant, str):
        raise ValueError(f"vector row variant must be a string, got {variant!r}")
    bucket = _int_in(row.get("bucket"), "vector row bucket", 0, BUCKET_COUNT - 1)
    return AssignmentVector(experiment_key=key, user_id=user_id, bucket=bucket, variant=variant)


def load_vectors(path: Path = VECTORS_PATH) -> VectorFixture:
    """Read and validate the shared assignment-vector fixture."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if raw.get("bucketCount") != BUCKET_COUNT:
        raise ValueError(f"bucketCount must be {BUCKET_COUNT}, got {raw.get('bucketCount')!r}")
    if raw.get("holdoutVariant") != HOLDOUT_VARIANT:
        raise ValueError(f"holdoutVariant must be {HOLDOUT_VARIANT!r}")
    experiments = {d.key: d for d in map(parse_definition, raw.get("experiments", []))}
    vectors = tuple(_parse_vector(row, experiments) for row in raw.get("vectors", []))
    return VectorFixture(experiments=experiments, vectors=vectors)
