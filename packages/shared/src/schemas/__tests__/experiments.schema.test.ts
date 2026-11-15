import { describe, it, expect } from "vitest";
import {
  EXPERIMENT_HOLDOUT_VARIANT,
  experimentAssignmentsResponseSchema,
  experimentDefinitionSchema,
  experimentExposureRequestSchema,
  experimentExposureResponseSchema,
} from "../experiments.schema";
import { ANALYTICS_BUCKET_COUNT } from "../analytics.schema";

const valid = {
  key: "save-trip-cta-v1",
  salt: "3f9a1c",
  holdoutBuckets: 1000,
  variants: [
    { key: "control", weight: 4500 },
    { key: "treatment", weight: 4500 },
  ],
};

const issuePaths = (input: unknown) => {
  const r = experimentDefinitionSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

describe("experimentDefinitionSchema", () => {
  it("accepts weights + holdout that cover every bucket exactly", () => {
    expect(experimentDefinitionSchema.parse(valid)).toEqual(valid);
    expect(
      experimentDefinitionSchema.safeParse({
        ...valid,
        holdoutBuckets: 0,
        variants: [
          { key: "control", weight: 5000 },
          { key: "treatment", weight: 5000 },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects weights that leave buckets unassigned or overflow", () => {
    expect(issuePaths({ ...valid, holdoutBuckets: 999 })).toContain("variants");
    expect(issuePaths({ ...valid, holdoutBuckets: 1001 })).toContain(
      "variants",
    );
  });

  it("rejects duplicate variant keys and the reserved holdout key", () => {
    expect(
      issuePaths({
        ...valid,
        variants: [
          { key: "control", weight: 4500 },
          { key: "control", weight: 4500 },
        ],
      }),
    ).toContain("variants");
    expect(
      issuePaths({
        ...valid,
        variants: [
          { key: EXPERIMENT_HOLDOUT_VARIANT, weight: 4500 },
          { key: "treatment", weight: 4500 },
        ],
      }),
    ).toContain("variants");
  });

  it("needs at least two variants, positive integer weights and slug keys", () => {
    expect(
      issuePaths({
        ...valid,
        holdoutBuckets: 0,
        variants: [{ key: "control", weight: ANALYTICS_BUCKET_COUNT }],
      }),
    ).toContain("variants");
    expect(
      issuePaths({
        ...valid,
        holdoutBuckets: 4500,
        variants: [
          { key: "control", weight: 5500 },
          { key: "treatment", weight: 0 },
        ],
      }),
    ).toContain("variants.1.weight");
    expect(issuePaths({ ...valid, key: "Save Trip" })).toContain("key");
    expect(
      issuePaths({
        ...valid,
        variants: [
          { key: "Control", weight: 4500 },
          { key: "treatment", weight: 4500 },
        ],
      }),
    ).toContain("variants.0.key");
  });

  it("needs a non-empty salt without the ':' separator and a holdout inside the bucket range", () => {
    expect(issuePaths({ ...valid, salt: "" })).toContain("salt");
    expect(issuePaths({ ...valid, salt: "a:b" })).toContain("salt");
    expect(issuePaths({ ...valid, holdoutBuckets: -1 })).toContain(
      "holdoutBuckets",
    );
    expect(
      issuePaths({ ...valid, holdoutBuckets: ANALYTICS_BUCKET_COUNT }),
    ).toContain("holdoutBuckets");
  });
});

describe("experiment wire schemas", () => {
  it("assignments response lists experimentKey + variant, holdout allowed", () => {
    const body = {
      assignments: [
        { experimentKey: "save-trip-cta-v1", variant: "treatment" },
        { experimentKey: "other-v2", variant: EXPERIMENT_HOLDOUT_VARIANT },
      ],
    };
    expect(experimentAssignmentsResponseSchema.parse(body)).toEqual(body);
    expect(
      experimentAssignmentsResponseSchema.safeParse({
        assignments: [{ experimentKey: "x", variant: "Not A Slug" }],
      }).success,
    ).toBe(false);
  });

  it("exposure request needs an experiment slug and a session id", () => {
    expect(
      experimentExposureRequestSchema.safeParse({
        experimentKey: "save-trip-cta-v1",
        sessionId: "sess-1",
      }).success,
    ).toBe(true);
    expect(
      experimentExposureRequestSchema.safeParse({
        experimentKey: "save-trip-cta-v1",
        sessionId: "",
      }).success,
    ).toBe(false);
    expect(
      experimentExposureRequestSchema.safeParse({
        experimentKey: "save-trip-cta-v1",
        sessionId: "s",
        variant: "treatment",
      }).success,
    ).toBe(false);
  });

  it("exposure response says which variant was logged and whether it was the session's first", () => {
    const body = {
      experimentKey: "save-trip-cta-v1",
      variant: "control",
      recorded: false,
    };
    expect(experimentExposureResponseSchema.parse(body)).toEqual(body);
  });
});
