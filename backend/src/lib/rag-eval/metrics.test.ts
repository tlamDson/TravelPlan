import { describe, it, expect } from "vitest";
import { recallAtK, precisionAtK, mrr, ndcgAtK, hitRate } from "./metrics";

// All test cases here are worked by hand in the PR description / plan
// (.claude/plans/1-rag-eval-eventual-hickey.md Phase 3) — if you can't
// verify nDCG by hand, the whole harness is untrustworthy, so every case
// below either has an exact fraction or uses the formula itself
// (toBeCloseTo(1 / Math.log2(3))) rather than a rounded decimal literal.

describe("recallAtK", () => {
  it("is |relevant ∩ retrieved[:k]| / |relevant|", () => {
    const retrieved = ["A", "X", "B", "C", "Y"];
    const relevant = { A: 2, B: 1, C: 1 };
    expect(recallAtK(retrieved, relevant, 5)).toBe(1); // all 3 relevant found
    expect(recallAtK(retrieved, relevant, 1)).toBeCloseTo(1 / 3); // only A found
  });

  it("is 0 when nothing relevant is retrieved", () => {
    expect(recallAtK(["X", "Y"], { A: 1 }, 2)).toBe(0);
  });

  it("is 0 by convention when the relevant set is empty (0/0 undefined otherwise)", () => {
    expect(recallAtK(["A", "B"], {}, 2)).toBe(0);
  });

  it("caps k at the retrieved list length without throwing", () => {
    expect(recallAtK(["A"], { A: 1, B: 1 }, 50)).toBeCloseTo(0.5);
  });

  it("ignores grade-0 labels when sizing the relevant set", () => {
    // B is explicitly labelled irrelevant (grade 0) — it must not count
    // toward |relevant|, otherwise finding A alone would score 1/2.
    expect(recallAtK(["A", "X"], { A: 2, B: 0 }, 2)).toBe(1);
  });

  it("is 0 when every label is grade 0 (no relevant items)", () => {
    expect(recallAtK(["A"], { A: 0 }, 1)).toBe(0);
  });
});

describe("precisionAtK", () => {
  it("is |relevant ∩ retrieved[:k]| / k", () => {
    const retrieved = ["B", "A", "C"];
    const relevant = { A: 1 };
    expect(precisionAtK(retrieved, relevant, 3)).toBeCloseTo(1 / 3);
  });

  it("divides by min(k, retrieved.length) — doesn't punish a retriever for legitimately returning fewer than k", () => {
    // TOP_K is 10, but a small city's corpus might only have 4 docs total.
    const retrieved = ["A", "B"];
    const relevant = { A: 1, B: 1 };
    expect(precisionAtK(retrieved, relevant, 10)).toBe(1); // 2/2, not 2/10
  });

  it("is 0 for an empty retrieved list", () => {
    expect(precisionAtK([], { A: 1 }, 5)).toBe(0);
  });
});

describe("mrr", () => {
  it("is 1 / (1-indexed rank of the first relevant hit)", () => {
    expect(mrr(["B", "A", "C"], { A: 1 })).toBeCloseTo(0.5); // A at rank 2
    expect(mrr(["A", "B", "C"], { A: 1 })).toBe(1); // A at rank 1
  });

  it("is 0 when no relevant item appears anywhere in the ranking", () => {
    expect(mrr(["X", "Y"], { A: 1 })).toBe(0);
  });

  it("uses the earliest relevant hit when multiple are present", () => {
    expect(mrr(["X", "B", "A"], { A: 1, B: 1 })).toBeCloseTo(0.5); // B at rank 2, not A at rank 3
  });
});

describe("ndcgAtK", () => {
  it("matches the standard graded-relevance DCG/IDCG formula, hand-verified", () => {
    // relevant = {A: 2, B: 1, C: 1}; retrieved = [A, X, B, C, Y]
    // DCG@5 = (2^2-1)/log2(2) + 0 + (2^1-1)/log2(4) + (2^1-1)/log2(5) + 0
    //       = 3/1 + 1/2 + 1/log2(5)
    // IDCG@5 (ideal order [A,B,C], grades [2,1,1]) = 3/1 + 1/log2(3) + 1/log2(4)
    const retrieved = ["A", "X", "B", "C", "Y"];
    const relevant = { A: 2, B: 1, C: 1 };

    const dcg = 3 / 1 + 0 + 1 / 2 + 1 / Math.log2(5) + 0;
    const idcg = 3 / 1 + 1 / Math.log2(3) + 1 / Math.log2(4);

    expect(ndcgAtK(retrieved, relevant, 5)).toBeCloseTo(dcg / idcg, 10);
  });

  it("is 1.0 when the ranking is already ideal (all relevant items first, in grade order)", () => {
    expect(ndcgAtK(["A", "B"], { A: 2, B: 1 }, 2)).toBeCloseTo(1);
  });

  it("matches 1/log2(rank+1) for a single relevant item at a known rank", () => {
    // relevant = {A: 1}, retrieved = [X, A, Y] -> A at position 2 (1-indexed)
    expect(ndcgAtK(["X", "A", "Y"], { A: 1 }, 3)).toBeCloseTo(1 / Math.log2(3));
  });

  it("is 0 by convention when the relevant set is empty (IDCG would be 0)", () => {
    expect(ndcgAtK(["A", "B"], {}, 2)).toBe(0);
  });

  it("is 0 when nothing relevant is retrieved", () => {
    expect(ndcgAtK(["X", "Y"], { A: 1 }, 2)).toBe(0);
  });
});

describe("hitRate", () => {
  it("is 1 when at least one relevant item is in the top k, else 0", () => {
    expect(hitRate(["X", "A"], { A: 1 }, 2)).toBe(1);
    expect(hitRate(["X", "Y"], { A: 1 }, 2)).toBe(0);
  });

  it("only looks within the top k, not the whole retrieved list", () => {
    expect(hitRate(["X", "A"], { A: 1 }, 1)).toBe(0); // A is at rank 2, outside top-1
  });

  it("is 0 when the relevant set is empty", () => {
    expect(hitRate(["A", "B"], {}, 2)).toBe(0);
  });
});
