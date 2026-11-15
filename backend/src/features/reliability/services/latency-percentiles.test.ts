import { describe, it, expect } from "vitest";
import { percentile, computeLatencyStats } from "./latency-percentiles";

describe("percentile", () => {
  it("returns an observed value at p95 for a large sample (nearest-rank, not interpolated)", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // [1..100]
    expect(percentile(values, 0.95)).toBe(95);
  });

  it("returns the single value for a 1-element sample regardless of p", () => {
    expect(percentile([5], 0.99)).toBe(5);
  });

  it("returns 0 for an empty array (documented convention, never throws/NaN)", () => {
    expect(percentile([], 0.95)).toBe(0);
  });

  it("does not mutate the input array", () => {
    const input = [50, 10, 90, 30];
    const original = [...input];
    percentile(input, 0.5);
    expect(input).toEqual(original);
  });

  it("sorts numerically, not lexicographically — a case the default Array.sort comparator would get wrong", () => {
    // [10, 9, 100].sort() with no comparator (lexicographic) yields
    // [10, 100, 9] — p100 (max) would wrongly report 9 instead of 100.
    const values = [10, 9, 100];
    expect(percentile(values, 1)).toBe(100);
  });
});

describe("computeLatencyStats", () => {
  it("computes count and non-decreasing percentiles matching the source schema's invariant", () => {
    const values = [10, 9, 100, 2, 1, 50, 30, 8, 4, 77];
    const stats = computeLatencyStats(values);

    expect(stats.count).toBe(values.length);
    expect(stats.p50).toBeLessThanOrEqual(stats.p95);
    expect(stats.p95).toBeLessThanOrEqual(stats.p99);
    expect(stats.p99).toBeLessThanOrEqual(stats.max);
  });

  it("returns all-zero stats for an empty sample, never NaN", () => {
    const stats = computeLatencyStats([]);
    expect(stats).toEqual({ count: 0, p50: 0, p95: 0, p99: 0, max: 0 });
  });

  it("max matches the true maximum of the sample", () => {
    const stats = computeLatencyStats([5, 9000, 12, 3]);
    expect(stats.max).toBe(9000);
  });
});
