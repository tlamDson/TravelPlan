import { describe, it, expect } from "vitest";
import { randomExpected, oracleMetrics } from "./baselines";

// Hand-checkable case: pool N=4, relevant grades [2, 1] (|R|=2).

describe("randomExpected", () => {
  it("recall@k is k/N (each relevant doc lands in the top k with probability k/N)", () => {
    const m = randomExpected(4, [2, 1], [1, 3, 5]);
    expect(m["recall@1"]).toBeCloseTo(1 / 4);
    expect(m["recall@3"]).toBeCloseTo(3 / 4);
    expect(m["recall@5"]).toBe(1); // k ≥ N
  });

  it("MRR is the expectation of 1/rank of the first relevant doc", () => {
    // P(first at 1)=1/2, at 2 = 2/4*2/3 = 1/3, at 3 = 2/4*1/3 = 1/6
    // E = 1/2 + (1/3)(1/2) + (1/6)(1/3) = 9/18 + 3/18 + 1/18 = 13/18
    expect(randomExpected(4, [2, 1], [5]).mrr).toBeCloseTo(13 / 18);
  });

  it("nDCG@5 is E[DCG]/IDCG with each doc equally likely at every position", () => {
    const disc = [1, 2, 3, 4].map((i) => 1 / Math.log2(i + 1));
    const eDcg = ((3 + 1) / 4) * disc.reduce((a, b) => a + b, 0);
    const idcg = 3 * disc[0]! + 1 * disc[1]!;
    expect(randomExpected(4, [2, 1], [5])["ndcg@5"]).toBeCloseTo(eDcg / idcg);
  });

  it("MRR is 1 when every doc in the pool is relevant", () => {
    expect(randomExpected(2, [1, 1], [5]).mrr).toBeCloseTo(1);
  });
});

describe("oracleMetrics", () => {
  it("recall@k is min(k,|R|)/|R| and nDCG/MRR are 1", () => {
    const m = oracleMetrics([2, 1, 1, 1, 1, 1], [3, 5]);
    expect(m["recall@3"]).toBeCloseTo(3 / 6);
    expect(m["recall@5"]).toBeCloseTo(5 / 6);
    expect(m["ndcg@5"]).toBe(1);
    expect(m.mrr).toBe(1);
  });
});
