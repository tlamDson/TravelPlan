import { describe, it, expect } from "vitest";
import { createBm25Index } from "./bm25";

// 3 docs, hand-computed with k1 = 1.2, b = 0.75:
//   d0 = [bar, bar, alley]   len 3
//   d1 = [market, fish]      len 2
//   d2 = [bar, market]       len 2
// N = 3, avgdl = 7/3
// idf(t) = ln(1 + (N - df + 0.5) / (df + 0.5))
const docs = [
  ["bar", "bar", "alley"],
  ["market", "fish"],
  ["bar", "market"],
];
const idf = (df: number) => Math.log(1 + (3 - df + 0.5) / (df + 0.5));
const tf = (f: number, len: number) =>
  (f * 2.2) / (f + 1.2 * (1 - 0.75 + (0.75 * len) / (7 / 3)));

describe("createBm25Index", () => {
  const idx = createBm25Index(docs);

  it("scores a single-term query by the Okapi formula", () => {
    expect(idx.score(["bar"], 0)).toBeCloseTo(idf(2) * tf(2, 3), 10);
    expect(idx.score(["bar"], 2)).toBeCloseTo(idf(2) * tf(1, 2), 10);
    expect(idx.score(["bar"], 1)).toBe(0);
  });

  it("sums over distinct query terms (repeating a query term doesn't double it)", () => {
    const expected = idf(2) * tf(1, 2) + idf(2) * tf(1, 2); // d2 has bar and market
    expect(idx.score(["bar", "market"], 2)).toBeCloseTo(expected, 10);
    expect(idx.score(["bar", "bar", "market"], 2)).toBeCloseTo(expected, 10);
  });

  it("gives rarer terms more weight", () => {
    expect(idx.score(["alley"], 0)).toBeGreaterThan(idx.score(["bar"], 2));
  });

  it("is 0 for a term no doc contains", () => {
    expect(idx.score(["sushi"], 0)).toBe(0);
  });

  it("ranks candidate rows, dropping zero-score docs, ties broken by row", () => {
    expect(idx.rank(["bar"], [0, 1, 2])).toEqual([0, 2]);
    expect(idx.rank(["market"], [2, 1])).toEqual([1, 2]); // d1 shorter-equal len → tie → lower row first
    expect(idx.rank(["bar"], [1])).toEqual([]);
  });

  it("takes k1 and b as parameters", () => {
    const flat = createBm25Index(docs, { k1: 1.2, b: 0 });
    expect(flat.score(["bar"], 2)).toBeCloseTo(
      idf(2) * ((1 * 2.2) / (1 + 1.2)),
      10,
    );
  });
});
