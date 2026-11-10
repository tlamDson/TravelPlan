import { describe, it, expect } from "vitest";
import { GoldenSetSchema } from "./golden-schema";

const base = {
  version: 1,
  snapshotId: "pi-20261112-ab12cd34",
  labeler: "lam",
  gradeScale: { "1": "partial", "2": "direct" },
  folds: { tokyo: 0 },
  items: [
    {
      id: "q-tokyo-001",
      cityIdKey: "tokyo",
      countryIdKey: "jp",
      query: "q",
      queryType: "specific",
      source: "human",
      preferences: null,
      labels: { "tokyo::Golden Gai": 2 },
      exhaustive: true,
      labeledAt: "2026-11-12",
      notes: "",
    },
  ],
};

describe("GoldenSetSchema", () => {
  it("parses the documented format", () => {
    expect(GoldenSetSchema.parse(base).items[0]!.labels).toEqual({
      "tokyo::Golden Gai": 2,
    });
  });

  it("rejects grade 0 — absence already means 0", () => {
    const bad = structuredClone(base);
    bad.items[0]!.labels = { "tokyo::Golden Gai": 0 };
    expect(() => GoldenSetSchema.parse(bad)).toThrow();
  });

  it("rejects grades above 2 and unknown queryTypes", () => {
    const g3 = structuredClone(base);
    g3.items[0]!.labels = { "tokyo::Golden Gai": 3 };
    expect(() => GoldenSetSchema.parse(g3)).toThrow();
    const qt = structuredClone(base);
    qt.items[0]!.queryType = "vague";
    expect(() => GoldenSetSchema.parse(qt)).toThrow();
  });

  it("allows labeledAt null for drafted-but-unlabeled items", () => {
    const draft = structuredClone(base) as unknown as {
      items: { labeledAt: string | null }[];
    };
    draft.items[0]!.labeledAt = null;
    expect(() => GoldenSetSchema.parse(draft)).not.toThrow();
  });
});
