import { describe, it, expect } from "vitest";
import {
  computeSli,
  computeErrorBudget,
  computeBurnRate,
  projectExhaustion,
} from "./slo-math";

describe("computeSli — the FALLBACK honesty problem", () => {
  it("counts fallback as bad by default (fallbackCountsAsGood: false)", () => {
    const result = computeSli(
      { completed: 90, fallback: 5, failed: 5 },
      { fallbackCountsAsGood: false },
    );
    expect(result.sli).toBe(0.9);
    expect(result.badEvents).toBe(10);
  });

  it("counts fallback as good when fallbackCountsAsGood: true (the alternative policy, made explicit)", () => {
    const result = computeSli(
      { completed: 90, fallback: 5, failed: 5 },
      { fallbackCountsAsGood: true },
    );
    expect(result.sli).toBe(0.95);
    expect(result.badEvents).toBe(5);
  });
});

describe("computeSli — slowButCompleted counts as bad regardless of fallback policy", () => {
  it("a completed-but-slow job degrades the SLI even though BullMQ reports it as success", () => {
    const result = computeSli(
      { completed: 100, fallback: 0, failed: 0, slowButCompleted: 10 },
      { fallbackCountsAsGood: false },
    );
    expect(result.validEvents).toBe(100);
    expect(result.badEvents).toBe(10);
    expect(result.sli).toBe(0.9);
  });

  it("defaults slowButCompleted to 0 when omitted", () => {
    const result = computeSli(
      { completed: 100, fallback: 0, failed: 0 },
      { fallbackCountsAsGood: false },
    );
    expect(result.sli).toBe(1);
  });

  it("never double-counts a job as both fallback and slowButCompleted — clamps to completed, never a negative goodEvents/sli", () => {
    // Fallback is naturally the slowest path (trip.processor.ts only
    // reaches it after 3 exhausted AI retries) — a caller could plausibly
    // pass the same jobs in both buckets. slowButCompleted is documented
    // as a subset of `completed`, so with completed: 0 there are zero
    // "slow completions" to count, regardless of what slowButCompleted says.
    const result = computeSli(
      { completed: 0, fallback: 10, failed: 0, slowButCompleted: 10 },
      { fallbackCountsAsGood: false, minEventsForSli: 1 },
    );
    expect(result.badEvents).toBe(10);
    expect(result.goodEvents).toBe(0);
    expect(result.sli).toBe(0);
    expect(result.goodEvents).toBeGreaterThanOrEqual(0);
    expect(result.sli).toBeGreaterThanOrEqual(0);
  });
});

describe("computeSli — insufficient-data guard", () => {
  it("returns sli: null and insufficientData: true below the minimum event threshold", () => {
    const result = computeSli(
      { completed: 9, fallback: 1, failed: 0 }, // 10 valid events, default min is 30
      { fallbackCountsAsGood: false },
    );
    expect(result.validEvents).toBe(10);
    expect(result.insufficientData).toBe(true);
    expect(result.sli).toBeNull();
  });

  it("never returns NaN or throws for zero events", () => {
    const result = computeSli(
      { completed: 0, fallback: 0, failed: 0 },
      { fallbackCountsAsGood: false },
    );
    expect(result.sli).toBeNull();
    expect(result.insufficientData).toBe(true);
    expect(Number.isNaN(result.sli)).toBe(false);
  });

  it("respects an explicit minEventsForSli override", () => {
    const result = computeSli(
      { completed: 9, fallback: 1, failed: 0 },
      { fallbackCountsAsGood: false, minEventsForSli: 5 },
    );
    expect(result.insufficientData).toBe(false);
    expect(result.sli).toBe(0.9);
  });
});

describe("computeErrorBudget", () => {
  it("computes budget consumption for 1000 valid / 60 bad at a 0.9 target", () => {
    // budgetTotal = validEvents * (1 - target) = 1000 * 0.1 = 100
    // consumedRatio = budgetConsumed / budgetTotal = 60 / 100 = 0.6
    // sli = (1000-60)/1000 = 0.94; badRate = 0.06; burnRate = 0.06 / 0.1 = 0.6
    const sli = {
      validEvents: 1000,
      goodEvents: 940,
      badEvents: 60,
      sli: 0.94,
      insufficientData: false,
    };
    const budget = computeErrorBudget(sli, 0.9);

    // toBeCloseTo, not toBe — 1000 * (1 - 0.9) is 99.99999999999997 in
    // IEEE 754 float arithmetic, not exactly 100. That's a float
    // representation artifact, not a logic bug.
    expect(budget.budgetTotal).toBeCloseTo(100);
    expect(budget.budgetConsumed).toBe(60);
    expect(budget.consumedRatio).toBeCloseTo(0.6);
    expect(budget.burnRate).toBeCloseTo(0.6);
  });

  it("clamps budgetRemaining at 0 when over-exhausted, but does NOT clamp sli itself", () => {
    const sli = {
      validEvents: 1000,
      goodEvents: 850,
      badEvents: 150,
      sli: 0.85,
      insufficientData: false,
    };
    const budget = computeErrorBudget(sli, 0.9);

    expect(budget.consumedRatio).toBeCloseTo(1.5);
    expect(budget.budgetRemaining).toBe(0);
    expect(sli.sli).toBe(0.85); // untouched — still visible how bad it is
  });

  it("does not divide by zero when target is 1.0 (zero-width budget)", () => {
    const sli = {
      validEvents: 100,
      goodEvents: 100,
      badEvents: 0,
      sli: 1,
      insufficientData: false,
    };
    const budget = computeErrorBudget(sli, 1);
    expect(budget.budgetTotal).toBe(0);
    expect(Number.isNaN(budget.consumedRatio)).toBe(false);
  });

  it("still returns real budgetTotal/budgetConsumed numbers (not null) when sli is insufficientData — burnRate is 0, but insufficientData travels alongside it so callers can't misread 0 as healthy", () => {
    const sli = {
      validEvents: 5,
      goodEvents: 5,
      badEvents: 0,
      sli: null,
      insufficientData: true,
    };
    const budget = computeErrorBudget(sli, 0.9);
    expect(budget.budgetTotal).toBeCloseTo(0.5);
    expect(budget.budgetConsumed).toBe(0);
    expect(budget.burnRate).toBe(0);
  });
});

describe("computeBurnRate", () => {
  it("returns 0 when the SLI is null (insufficient data) — insufficientData is the real signal, not a fabricated burn rate", () => {
    const sli = {
      validEvents: 5,
      goodEvents: 5,
      badEvents: 0,
      sli: null,
      insufficientData: true,
    };
    expect(computeBurnRate(sli, 0.9)).toBe(0);
  });
});

describe("projectExhaustion", () => {
  const windowMs = 28 * 24 * 60 * 60 * 1000; // 28 days
  const now = new Date("2026-08-01T00:00:00.000Z");

  it("a burn rate of exactly 1.0 with a full remaining budget exhausts at the end of the window", () => {
    const budget = {
      target: 0.9,
      budgetTotal: 100,
      budgetConsumed: 0,
      budgetRemaining: 100,
      consumedRatio: 0,
      burnRate: 1,
      exhaustsAt: null,
    };
    const exhaustsAt = projectExhaustion(budget, windowMs, now);
    expect(exhaustsAt?.getTime()).toBe(now.getTime() + windowMs);
  });

  it("a burn rate of 0 never exhausts", () => {
    const budget = {
      target: 0.9,
      budgetTotal: 100,
      budgetConsumed: 0,
      budgetRemaining: 100,
      consumedRatio: 0,
      burnRate: 0,
      exhaustsAt: null,
    };
    expect(projectExhaustion(budget, windowMs, now)).toBeNull();
  });

  it("a burn rate of 14.4 exhausts a full 28-day budget in ~2 days (the classic SRE fast-burn threshold)", () => {
    const budget = {
      target: 0.9,
      budgetTotal: 100,
      budgetConsumed: 0,
      budgetRemaining: 100,
      consumedRatio: 0,
      burnRate: 14.4,
      exhaustsAt: null,
    };
    const exhaustsAt = projectExhaustion(budget, windowMs, now);
    const daysUntilExhaustion =
      (exhaustsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysUntilExhaustion).toBeCloseTo(28 / 14.4, 1); // ≈1.9 days
  });

  it("an already-exhausted budget (remaining 0) with an active burn rate exhausts immediately", () => {
    const budget = {
      target: 0.9,
      budgetTotal: 100,
      budgetConsumed: 100,
      budgetRemaining: 0,
      consumedRatio: 1,
      burnRate: 0.5,
      exhaustsAt: null,
    };
    expect(projectExhaustion(budget, windowMs, now)?.getTime()).toBe(
      now.getTime(),
    );
  });
});
