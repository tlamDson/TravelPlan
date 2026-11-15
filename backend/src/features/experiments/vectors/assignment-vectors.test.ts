import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  EXPERIMENT_HOLDOUT_VARIANT,
  experimentDefinitionSchema,
  type ExperimentDefinition,
} from "@travelplan/shared";
import { assignVariant } from "../services/assignment";
import {
  ASSIGNMENT_VECTOR_COUNT,
  ASSIGNMENT_VECTORS_PATH,
  buildAssignmentVectors,
  serializeAssignmentVectors,
} from "./assignment-vectors";

type Vector = {
  experimentKey: string;
  userId: string;
  bucket: number;
  variant: string;
};

const filePath = resolve(
  __dirname,
  "../../../../../packages/shared/fixtures/assignment-vectors.json",
);
const raw = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
const file = JSON.parse(raw) as {
  version: number;
  bucketCount: number;
  experiments: unknown[];
  vectors: Vector[];
};

describe("packages/shared/fixtures/assignment-vectors.json", () => {
  const experiments = new Map<string, ExperimentDefinition>(
    file.experiments.map((e) => {
      const def = experimentDefinitionSchema.parse(e);
      return [def.key, def];
    }),
  );

  it("is the path the generator writes", () => {
    expect(resolve(ASSIGNMENT_VECTORS_PATH)).toBe(filePath);
  });

  it("holds 10,000 vectors over valid experiment definitions", () => {
    expect(file.version).toBe(1);
    expect(file.bucketCount).toBe(10_000);
    expect(ASSIGNMENT_VECTOR_COUNT).toBe(10_000);
    expect(file.vectors).toHaveLength(ASSIGNMENT_VECTOR_COUNT);
    expect(experiments.size).toBeGreaterThanOrEqual(3);
    expect([...experiments.values()].some((e) => e.holdoutBuckets > 0)).toBe(
      true,
    );
  });

  it("every vector matches the TypeScript assignment (one user off is red)", () => {
    const mismatches = file.vectors.filter((v) => {
      const def = experiments.get(v.experimentKey);
      if (!def) return true;
      const got = assignVariant(def, v.userId);
      return got.bucket !== v.bucket || got.variant !== v.variant;
    });
    expect(mismatches).toEqual([]);
  });

  it("covers every variant of every experiment, holdout included", () => {
    for (const def of experiments.values()) {
      const seen = new Set(
        file.vectors
          .filter((v) => v.experimentKey === def.key)
          .map((v) => v.variant),
      );
      const expected = def.variants.map((v) => v.key);
      if (def.holdoutBuckets > 0) expected.push(EXPERIMENT_HOLDOUT_VARIANT);
      expect([...seen].sort()).toEqual(expected.sort());
    }
  });

  it("includes edge-case userIds: non-ASCII, the ':' separator, 128 chars", () => {
    const ids = file.vectors.map((v) => v.userId);
    const nonAscii = (id: string) =>
      [...id].some((ch) => ch.codePointAt(0)! > 0x7f);
    expect(ids.some(nonAscii)).toBe(true);
    expect(ids.some((id) => id.includes(":"))).toBe(true);
    expect(ids.some((id) => id.length === 128)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is exactly what the generator writes (regenerate with npm run generate:assignment-vectors -w backend)", () => {
    expect(serializeAssignmentVectors(buildAssignmentVectors())).toBe(raw);
  });
});
