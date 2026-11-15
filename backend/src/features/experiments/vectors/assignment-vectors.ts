import { resolve } from "node:path";
import {
  ANALYTICS_BUCKET_COUNT,
  EXPERIMENT_HOLDOUT_VARIANT,
  type ExperimentDefinition,
} from "@travelplan/shared";
import { assignVariant } from "../services/assignment";

/**
 * packages/shared/fixtures/assignment-vectors.json (B2 plan): 10,000
 * (experiment, userId) → (bucket, variant) rows that the TS assignment
 * (assignment-vectors.test.ts) and the Python one in analytics/abkit
 * (PR 9) must both reproduce — one user off is red on both sides.
 * Regenerate with `npm run generate:assignment-vectors -w backend`.
 */
export const ASSIGNMENT_VECTOR_COUNT = 10_000;
export const ASSIGNMENT_VECTORS_PATH = resolve(
  __dirname,
  "../../../../../packages/shared/fixtures/assignment-vectors.json",
);

/** Synthetic experiments: 50/50, 3 arms + 10% holdout, uneven 90/10. */
export const VECTOR_EXPERIMENTS: readonly ExperimentDefinition[] = [
  {
    key: "vector-ab",
    salt: "s1",
    holdoutBuckets: 0,
    variants: [
      { key: "control", weight: 5000 },
      { key: "treatment", weight: 5000 },
    ],
  },
  {
    key: "vector-holdout",
    salt: "9f3c",
    holdoutBuckets: 1000,
    variants: [
      { key: "control", weight: 3000 },
      { key: "a", weight: 3000 },
      { key: "b", weight: 3000 },
    ],
  },
  {
    key: "vector-uneven",
    salt: "2026-11-13",
    holdoutBuckets: 0,
    variants: [
      { key: "control", weight: 9000 },
      { key: "treatment", weight: 1000 },
    ],
  },
];

/** Ids that tend to break ports: UTF-8, the ':' separator, max length. */
const EDGE_USER_IDS = [
  "người-dùng-1",
  "🧳-traveler",
  "user:with:colons",
  `user_${"z".repeat(123)}`,
  "user_2NNEqL2nrIRdJ194ndJqAHwEfxC",
];

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** mulberry32: tiny seeded PRNG, so the file is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type AssignmentVector = {
  experimentKey: string;
  userId: string;
  bucket: number;
  variant: string;
};

export function buildAssignmentVectors(): AssignmentVector[] {
  const random = mulberry32(20_261_113);
  const vectors: AssignmentVector[] = [];
  for (let i = 0; i < ASSIGNMENT_VECTOR_COUNT; i++) {
    const def = VECTOR_EXPERIMENTS[i % VECTOR_EXPERIMENTS.length]!;
    let userId = EDGE_USER_IDS[i];
    if (userId === undefined) {
      userId = "user_";
      for (let c = 0; c < 20; c++) {
        userId += BASE62[Math.floor(random() * BASE62.length)];
      }
    }
    vectors.push({
      experimentKey: def.key,
      userId,
      ...assignVariant(def, userId),
    });
  }
  return vectors;
}

/** One experiment / vector per line: readable diffs, ~0.8 MB. */
export function serializeAssignmentVectors(
  vectors: readonly AssignmentVector[],
): string {
  const header = {
    version: 1,
    algorithm:
      "bucket = int.from_bytes(sha256(f'{salt}:{experimentKey}:{userId}'.encode('utf-8')).digest()[:8], 'big') % bucketCount; " +
      "bucket < holdoutBuckets -> holdoutVariant, else walk variants' cumulative weights in order",
    bucketCount: ANALYTICS_BUCKET_COUNT,
    holdoutVariant: EXPERIMENT_HOLDOUT_VARIANT,
  };
  const lines = Object.entries(header).map(
    ([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`,
  );
  const list = (items: readonly unknown[]) =>
    items.map((item) => `    ${JSON.stringify(item)}`).join(",\n");
  return [
    "{",
    ...lines,
    `  "experiments": [\n${list(VECTOR_EXPERIMENTS)}\n  ],`,
    `  "vectors": [\n${list(vectors)}\n  ]`,
    "}",
    "",
  ].join("\n");
}
