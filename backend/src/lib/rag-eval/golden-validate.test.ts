import { describe, it, expect } from "vitest";
import { tinySnapshot } from "../../test/rag-eval-fixtures";
import { validateGoldenSet, summarizeGoldenSet } from "./golden-validate";
import type { GoldenItem, GoldenSet } from "./golden-schema";

const snap = tinySnapshot();

function item(over: Partial<GoldenItem> = {}): GoldenItem {
  return {
    id: "q-tokyo-001",
    cityIdKey: "tokyo",
    countryIdKey: "jp",
    query: "late night bars in tiny alleys",
    queryType: "specific",
    source: "human",
    preferences: null,
    labels: { "tokyo::Golden Gai": 2 },
    exhaustive: true,
    labeledAt: "2026-11-12",
    notes: "",
    ...over,
  };
}

function golden(items: GoldenItem[], over: Partial<GoldenSet> = {}): GoldenSet {
  return {
    version: 1,
    snapshotId: snap.meta.snapshotId,
    labeler: "lam",
    gradeScale: { "1": "partial", "2": "direct" },
    folds: { tokyo: 0, hanoi: 1 },
    items,
    ...over,
  };
}

describe("validateGoldenSet", () => {
  it("accepts a well-formed set", () => {
    expect(validateGoldenSet(golden([item()]), snap)).toEqual([]);
  });

  it("rejects a set built against a different snapshot", () => {
    const errs = validateGoldenSet(
      golden([item()], { snapshotId: "pi-old" }),
      snap,
    );
    expect(errs.join("\n")).toMatch(/snapshotId/);
  });

  it("rejects a label that doesn't exist in the snapshot", () => {
    const errs = validateGoldenSet(
      golden([item({ labels: { "tokyo::Robot Restaurant": 2 } })]),
      snap,
    );
    expect(errs.join("\n")).toMatch(
      /q-tokyo-001.*Robot Restaurant.*not in snapshot/,
    );
  });

  it("rejects a label from another city", () => {
    const errs = validateGoldenSet(
      golden([item({ labels: { "hanoi::Hoan Kiem Lake": 1 } })]),
      snap,
    );
    expect(errs.join("\n")).toMatch(/q-tokyo-001.*hanoi::Hoan Kiem Lake.*city/);
  });

  it("requires no_answer items to have empty labels", () => {
    const errs = validateGoldenSet(
      golden([item({ queryType: "no_answer" })]),
      snap,
    );
    expect(errs.join("\n")).toMatch(/no_answer/);
    expect(
      validateGoldenSet(
        golden([item({ queryType: "no_answer", labels: {} })]),
        snap,
      ),
    ).toEqual([]);
  });

  it("requires answerable items to have at least one label", () => {
    const errs = validateGoldenSet(golden([item({ labels: {} })]), snap);
    expect(errs.join("\n")).toMatch(/q-tokyo-001.*no labels/);
  });

  it("rejects an unknown city or a countryIdKey that disagrees with the snapshot", () => {
    expect(
      validateGoldenSet(
        golden([
          item({ cityIdKey: "paris", labels: {}, queryType: "no_answer" }),
        ]),
        snap,
      ).join("\n"),
    ).toMatch(/paris.*not in snapshot/);
    expect(
      validateGoldenSet(golden([item({ countryIdKey: "fr" })]), snap).join(
        "\n",
      ),
    ).toMatch(/countryIdKey/);
  });

  it("rejects duplicate item ids", () => {
    const errs = validateGoldenSet(golden([item(), item()]), snap);
    expect(errs.join("\n")).toMatch(/duplicate id q-tokyo-001/);
  });

  it("requires every item's city to have a fold in 0..4", () => {
    expect(
      validateGoldenSet(golden([item()], { folds: { hanoi: 1 } }), snap).join(
        "\n",
      ),
    ).toMatch(/tokyo.*fold/);
    expect(
      validateGoldenSet(
        golden([item()], { folds: { tokyo: 7, hanoi: 1 } }),
        snap,
      ).join("\n"),
    ).toMatch(/tokyo.*fold/);
  });

  it("flags unlabeled items unless allowUnlabeled is set", () => {
    const draft = item({ labeledAt: null, labels: {} });
    expect(validateGoldenSet(golden([draft]), snap).join("\n")).toMatch(
      /not labeled/,
    );
    expect(
      validateGoldenSet(golden([draft]), snap, { allowUnlabeled: true }),
    ).toEqual([]);
  });
});

describe("summarizeGoldenSet", () => {
  it("counts items by type, labeled state, cities and oversized specific items", () => {
    const s = summarizeGoldenSet(
      golden([
        item(),
        item({ id: "q-tokyo-002", queryType: "no_answer", labels: {} }),
        item({
          id: "q-hanoi-001",
          cityIdKey: "hanoi",
          countryIdKey: "vn",
          labeledAt: null,
          labels: {},
        }),
      ]),
    );
    expect(s).toEqual({
      total: 3,
      labeled: 2,
      unlabeled: 1,
      byType: { specific: 2, no_answer: 1 },
      cities: 2,
      specificOverFour: 0,
    });
  });
});
