import { describe, it, expect } from "vitest";
import { overlapAtK, summarizeParity } from "./parity";

describe("overlapAtK", () => {
  it("is |a[:k] ∩ b[:k]| / k, order-insensitive", () => {
    expect(overlapAtK(["A", "B", "C"], ["C", "B", "A"], 3)).toBe(1);
    expect(overlapAtK(["A", "B", "X"], ["A", "B", "C"], 3)).toBeCloseTo(2 / 3);
  });

  it("divides by the longer list when both are shorter than k", () => {
    expect(overlapAtK(["A", "B"], ["A"], 5)).toBe(0.5);
  });

  it("is 1 when both lists are empty", () => {
    expect(overlapAtK([], [], 5)).toBe(1);
  });
});

describe("summarizeParity", () => {
  it("averages overlap and counts exact top-k order matches", () => {
    const s = summarizeParity(
      [
        { id: "a", offline: ["A", "B"], atlas: ["A", "B"] },
        { id: "b", offline: ["A", "B"], atlas: ["B", "A"] },
        { id: "c", offline: ["A", "B"], atlas: ["A", "X"] },
      ],
      2,
    );
    expect(s.n).toBe(3);
    expect(s.meanOverlap).toBeCloseTo((1 + 1 + 0.5) / 3);
    expect(s.exactOrderRate).toBeCloseTo(1 / 3);
    expect(s.worst.map((w) => w.id)).toEqual(["c"]);
  });
});
