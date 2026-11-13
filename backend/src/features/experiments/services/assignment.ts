import { createHash } from "node:crypto";
import {
  ANALYTICS_BUCKET_COUNT,
  EXPERIMENT_HOLDOUT_VARIANT,
  type ExperimentDefinition,
} from "@travelplan/shared";

/**
 * Deterministic bucket in 0..9999 (B2 plan): the first 8 bytes of
 * SHA-256(`salt:experimentKey:userId`), read as an unsigned big-endian
 * 64-bit integer, mod ANALYTICS_BUCKET_COUNT. Python reproduces it with
 *   int.from_bytes(hashlib.sha256(s.encode()).digest()[:8], "big") % 10000
 * — packages/shared/fixtures/assignment-vectors.json pins both.
 */
export function computeBucket(
  salt: string,
  experimentKey: string,
  userId: string,
): number {
  const digest = createHash("sha256")
    .update(`${salt}:${experimentKey}:${userId}`, "utf8")
    .digest();
  return Number(digest.readBigUInt64BE(0) % BigInt(ANALYTICS_BUCKET_COUNT));
}

/**
 * Buckets [0, holdoutBuckets) are the holdout; the rest walk the
 * variants' cumulative weights in declared order. The definition schema
 * guarantees weights + holdoutBuckets cover all 10,000 buckets exactly.
 */
export function variantForBucket(
  def: ExperimentDefinition,
  bucket: number,
): string {
  if (
    !Number.isInteger(bucket) ||
    bucket < 0 ||
    bucket >= ANALYTICS_BUCKET_COUNT
  ) {
    throw new RangeError(
      `bucket ${bucket} outside 0..${ANALYTICS_BUCKET_COUNT - 1}`,
    );
  }
  if (bucket < def.holdoutBuckets) return EXPERIMENT_HOLDOUT_VARIANT;
  let upper = def.holdoutBuckets;
  for (const variant of def.variants) {
    upper += variant.weight;
    if (bucket < upper) return variant.key;
  }
  throw new RangeError(
    `experiment ${def.key}: weights do not cover bucket ${bucket}`,
  );
}

export type Assignment = { bucket: number; variant: string };

export function assignVariant(
  def: ExperimentDefinition,
  userId: string,
): Assignment {
  const bucket = computeBucket(def.salt, def.key, userId);
  return { bucket, variant: variantForBucket(def, bucket) };
}
