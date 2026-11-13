import { describe, it, expect } from "vitest";
import {
  ANALYTICS_BUCKET_COUNT,
  EXPERIMENT_HOLDOUT_VARIANT,
  type ExperimentDefinition,
} from "@travelplan/shared";
import { assignVariant, computeBucket, variantForBucket } from "./assignment";

const ab: ExperimentDefinition = {
  key: "vector-ab",
  salt: "s1",
  holdoutBuckets: 0,
  variants: [
    { key: "control", weight: 5000 },
    { key: "treatment", weight: 5000 },
  ],
};

const withHoldout: ExperimentDefinition = {
  key: "vector-holdout",
  salt: "9f3c",
  holdoutBuckets: 1000,
  variants: [
    { key: "control", weight: 3000 },
    { key: "a", weight: 3000 },
    { key: "b", weight: 3000 },
  ],
};

describe("computeBucket", () => {
  // Expected values computed independently with Python's hashlib:
  //   int.from_bytes(sha256(f"{salt}:{key}:{user}".encode()).digest()[:8],
  //                  "big") % 10000
  it.each([
    ["s1", "vector-ab", "user_1", 5026],
    ["s1", "vector-ab", "user_2", 4710],
    ["9f3c", "vector-holdout", "user_2abcDEF", 4881],
    ["salt", "exp", "người-dùng", 5641],
    ["", "exp", "", 7071],
    ["a:b", "c", "d:e", 6340],
  ])(
    "SHA-256(%s:%s:%s) first 8 bytes mod 10000 = %i",
    (salt, key, user, bucket) => {
      expect(computeBucket(salt, key, user)).toBe(bucket);
    },
  );

  it("is deterministic and depends on salt, key and user", () => {
    expect(computeBucket("s1", "vector-ab", "user_1")).toBe(
      computeBucket("s1", "vector-ab", "user_1"),
    );
    const buckets = new Set([
      computeBucket("s1", "vector-ab", "user_1"),
      computeBucket("s2", "vector-ab", "user_1"),
      computeBucket("s1", "vector-cd", "user_1"),
    ]);
    expect(buckets.size).toBe(3);
  });

  it("spreads users evenly over the 10,000 buckets (no SRM from the hash)", () => {
    const n = 20_000;
    const deciles = new Array<number>(10).fill(0);
    for (let i = 0; i < n; i++) {
      const b = computeBucket("s1", "vector-ab", `user_${i}`);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(ANALYTICS_BUCKET_COUNT);
      deciles[Math.floor(b / 1000)]!++;
    }
    // chi-square with 9 df; 27.88 is the p = 0.001 critical value
    const expected = n / 10;
    const chi2 = deciles.reduce(
      (s, c) => s + (c - expected) ** 2 / expected,
      0,
    );
    expect(chi2).toBeLessThan(27.88);
  });
});

describe("variantForBucket", () => {
  it("puts buckets below holdoutBuckets in the holdout", () => {
    expect(variantForBucket(withHoldout, 0)).toBe(EXPERIMENT_HOLDOUT_VARIANT);
    expect(variantForBucket(withHoldout, 999)).toBe(EXPERIMENT_HOLDOUT_VARIANT);
  });

  it("walks the variants' cumulative weights after the holdout", () => {
    expect(variantForBucket(withHoldout, 1000)).toBe("control");
    expect(variantForBucket(withHoldout, 3999)).toBe("control");
    expect(variantForBucket(withHoldout, 4000)).toBe("a");
    expect(variantForBucket(withHoldout, 6999)).toBe("a");
    expect(variantForBucket(withHoldout, 7000)).toBe("b");
    expect(variantForBucket(withHoldout, 9999)).toBe("b");
    expect(variantForBucket(ab, 0)).toBe("control");
    expect(variantForBucket(ab, 4999)).toBe("control");
    expect(variantForBucket(ab, 5000)).toBe("treatment");
  });

  it("throws when an unvalidated definition's weights leave the bucket uncovered", () => {
    const short = { ...ab, variants: [{ key: "control", weight: 10 }] };
    expect(() => variantForBucket(short, 10)).toThrow(/do not cover/);
  });

  it("throws on a bucket outside 0..9999", () => {
    expect(() => variantForBucket(ab, -1)).toThrow(RangeError);
    expect(() => variantForBucket(ab, ANALYTICS_BUCKET_COUNT)).toThrow(
      RangeError,
    );
  });
});

describe("assignVariant", () => {
  it("returns the user's bucket and the variant that bucket maps to", () => {
    expect(assignVariant(ab, "user_1")).toEqual({
      bucket: 5026,
      variant: "treatment",
    });
    expect(assignVariant(ab, "user_2")).toEqual({
      bucket: 4710,
      variant: "control",
    });
    expect(assignVariant(withHoldout, "user_2abcDEF")).toEqual({
      bucket: 4881,
      variant: "a",
    });
  });
});
