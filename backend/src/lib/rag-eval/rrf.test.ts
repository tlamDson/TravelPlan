import { describe, it, expect } from "vitest";
import { rrfFuse } from "./rrf";

describe("rrfFuse", () => {
  it("scores Σ 1/(k + rank) with 1-based ranks and sorts by it", () => {
    // k=60: A = 1/61 + 1/63, B = 1/62 + 1/61, C = 1/63, D = 1/62
    const fused = rrfFuse(
      [
        ["A", "B", "C"],
        ["B", "D", "A"],
      ],
      { k: 60 },
    );
    expect(fused.map((f) => f.id)).toEqual(["B", "A", "D", "C"]);
    expect(fused[0]!.score).toBeCloseTo(1 / 62 + 1 / 61, 12);
  });

  it("breaks score ties by best single-list rank, then by id", () => {
    // A and B both 1/61 + 1/62 — equal best rank (1) → id order
    expect(
      rrfFuse([
        ["A", "B"],
        ["B", "A"],
      ]).map((f) => f.id),
    ).toEqual(["A", "B"]);
  });

  it("applies per-list weights", () => {
    const fused = rrfFuse([["A"], ["B"]], { k: 60, weights: [1, 2] });
    expect(fused.map((f) => f.id)).toEqual(["B", "A"]);
    expect(fused[0]!.score).toBeCloseTo(2 / 61, 12);
  });

  it("tolerates empty lists and rejects a weight count mismatch", () => {
    expect(rrfFuse([["A"], []]).map((f) => f.id)).toEqual(["A"]);
    expect(() => rrfFuse([["A"], ["B"]], { weights: [1] })).toThrow(/weights/);
  });
});
