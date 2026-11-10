import { describe, it, expect } from "vitest";
import { mulberry32, clusterBootstrap } from "./bootstrap";

describe("mulberry32", () => {
  it("is deterministic per seed and in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(xs[0]);
  });
});

describe("clusterBootstrap", () => {
  const values = [
    { cluster: "tokyo", value: 1 },
    { cluster: "tokyo", value: 0 },
    { cluster: "hanoi", value: 1 },
    { cluster: "paris", value: 0 },
  ];

  it("reports the plain mean of all values as the point estimate", () => {
    expect(clusterBootstrap(values, { B: 200, seed: 1 }).mean).toBe(0.5);
  });

  it("is identical for the same seed and differs for another seed", () => {
    // 8 clusters with distinct values, small B: the CI genuinely depends on
    // which clusters get drawn (3 extreme clusters saturate at [0, 1]).
    const spread = Array.from({ length: 8 }, (_, i) => ({
      cluster: `c${i}`,
      value: (i * 0.37) % 1,
    }));
    const a = clusterBootstrap(spread, { B: 30, seed: 7 });
    expect(clusterBootstrap(spread, { B: 30, seed: 7 })).toEqual(a);
    expect(clusterBootstrap(spread, { B: 30, seed: 8 }).ci95).not.toEqual(
      a.ci95,
    );
  });

  it("brackets the mean with a CI inside the observed range", () => {
    const { mean, ci95 } = clusterBootstrap(values, { B: 2000, seed: 42 });
    expect(ci95[0]).toBeLessThanOrEqual(mean);
    expect(ci95[1]).toBeGreaterThanOrEqual(mean);
    expect(ci95[0]).toBeGreaterThanOrEqual(0);
    expect(ci95[1]).toBeLessThanOrEqual(1);
  });

  it("collapses to a zero-width CI when every cluster has the same mean", () => {
    const flat = [
      { cluster: "a", value: 0.5 },
      { cluster: "b", value: 0.5 },
    ];
    expect(clusterBootstrap(flat, { B: 100, seed: 1 })).toEqual({
      mean: 0.5,
      ci95: [0.5, 0.5],
    });
  });

  it("throws on empty input rather than reporting NaN", () => {
    expect(() => clusterBootstrap([], { B: 10, seed: 1 })).toThrow(/empty/);
  });
});
