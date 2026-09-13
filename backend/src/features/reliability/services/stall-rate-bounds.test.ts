import { describe, it, expect } from "vitest";
import {
  ruleOfThreeUpperBound,
  wilsonInterval,
  describeResolution,
} from "./stall-rate-bounds";

describe("ruleOfThreeUpperBound — 95% upper bound for zero observed events in n trials", () => {
  it("n=11 (jobs after the lockDuration tune) → 3/11 ≈ 0.2727", () => {
    expect(ruleOfThreeUpperBound(11)).toBeCloseTo(3 / 11, 10);
  });

  it("n=33 (jobs before the tune) → 3/33 ≈ 0.0909", () => {
    expect(ruleOfThreeUpperBound(33)).toBeCloseTo(3 / 33, 10);
  });

  it("n=1000 → 3/1000 = 0.003 (large sample tightens the bound)", () => {
    expect(ruleOfThreeUpperBound(1000)).toBeCloseTo(0.003, 10);
  });

  it("n=0 → 1 (no trials at all means zero information, worst case 100%)", () => {
    expect(ruleOfThreeUpperBound(0)).toBe(1);
  });

  it("negative n → 1 (defensive, never negative/NaN/Infinity)", () => {
    expect(ruleOfThreeUpperBound(-5)).toBe(1);
  });
});

describe("wilsonInterval — 95% confidence interval for a proportion (z=1.96)", () => {
  it("0 successes in 11 trials", () => {
    // p̂=0, z=1.96, n=11
    // denom = 1 + 1.96^2/11 = 1 + 3.8416/11 = 1.349236363636...
    // center = 0 + 3.8416/(2*11) = 0.174618181818...
    // margin = 1.96 * sqrt(0 + 3.8416/(4*121)) = 1.96 * sqrt(0.0079371...) = 1.96*0.0891011... = 0.17463...
    // lower = (0.174618 - 0.174636)/1.349236 ≈ -0.0000... clamped conceptually to ~0
    // upper = (0.174618 + 0.174636)/1.349236 ≈ 0.258716...
    const result = wilsonInterval(0, 11);
    expect(result.lower).toBeCloseTo(0, 2);
    expect(result.upper).toBeCloseTo(0.2587, 3);
  });

  it("50 successes in 100 trials → centered near 0.5 with a symmetric-ish interval", () => {
    // p̂=0.5, z=1.96, n=100
    // denom = 1 + 3.8416/100 = 1.038416
    // center = 0.5 + 3.8416/200 = 0.51920800...
    // margin = 1.96*sqrt(0.5*0.5/100 + 3.8416/40000) = 1.96*sqrt(0.0025+0.00009604) = 1.96*sqrt(0.00259604)
    //        = 1.96*0.050951... = 0.099864...
    // lower = (0.519208 - 0.099864)/1.038416 ≈ 0.403866...
    // upper = (0.519208 + 0.099864)/1.038416 ≈ 0.596198...
    const result = wilsonInterval(50, 100);
    expect(result.lower).toBeCloseTo(0.4039, 3);
    expect(result.upper).toBeCloseTo(0.5962, 3);
  });

  it("n=0 → full-uncertainty interval [0, 1]", () => {
    const result = wilsonInterval(0, 0);
    expect(result.lower).toBe(0);
    expect(result.upper).toBe(1);
  });

  it("all successes (n successes in n trials) → upper bound is 1, lower bound > 0", () => {
    const result = wilsonInterval(20, 20);
    expect(result.upper).toBeCloseTo(1, 5);
    expect(result.lower).toBeGreaterThan(0);
    expect(result.lower).toBeLessThan(1);
  });
});

describe("describeResolution — can this sample size distinguish 'tune worked' from 'never had stalls'?", () => {
  it("nBefore=33, nAfter=11 (the real B3 split): cận trên 95% cho nAfter ≈27.3% > 10% ngưỡng → không kết luận được", () => {
    const result = describeResolution(33, 11);
    expect(result.resolvable).toBe(false);
    expect(result.nBeforeUpperBoundPct).toBeCloseTo((3 / 33) * 100, 1);
    expect(result.nAfterUpperBoundPct).toBeCloseTo((3 / 11) * 100, 1);
    expect(result.message).toMatch(/không (thể )?(kết luận|rút ra)/i);
  });

  it("large samples on both sides (n=1000 each) → cận trên <10% cả hai phía → kết luận được", () => {
    const result = describeResolution(1000, 1000);
    expect(result.resolvable).toBe(true);
    expect(result.message).not.toMatch(/không (thể )?(kết luận|rút ra)/i);
  });

  it("boundary is driven by the smaller of the two samples (worse bound dominates)", () => {
    const result = describeResolution(1000, 11);
    expect(result.resolvable).toBe(false);
  });
});
