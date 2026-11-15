import { describe, it, expect } from "vitest";
import {
  SLO_TARGET,
  SLO_LATENCY_THRESHOLD_MS,
  SLO_WINDOW_DAYS,
  FAST_BURN_WINDOW_HOURS,
  SLOW_BURN_WINDOW_HOURS,
  MIN_EVENTS_FOR_SLI,
  JOB_METRIC_TTL_DAYS,
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_LIVENESS_TIMEOUT_MS,
  ERROR_BUDGET_WARNING_RATIO,
  ERROR_BUDGET_CRITICAL_RATIO,
} from "../slo";

describe("SLO_TARGET", () => {
  it("is strictly between 0 and 1 (a ratio, not a percentage)", () => {
    expect(SLO_TARGET).toBeGreaterThan(0);
    expect(SLO_TARGET).toBeLessThan(1);
  });
});

describe("JOB_METRIC_TTL_DAYS vs SLO_WINDOW_DAYS", () => {
  it("keeps job metrics longer than the compliance window", () => {
    // If TTL <= window, the oldest slice of the 28-day compliance window
    // silently disappears from Mongo before the window closes, and the
    // SLI drifts upward as data ages out from under it.
    expect(JOB_METRIC_TTL_DAYS).toBeGreaterThan(SLO_WINDOW_DAYS);
  });
});

describe("burn-rate windows", () => {
  it("orders fast-burn strictly inside slow-burn strictly inside the compliance window", () => {
    const complianceHours = SLO_WINDOW_DAYS * 24;
    expect(FAST_BURN_WINDOW_HOURS).toBeLessThan(SLOW_BURN_WINDOW_HOURS);
    expect(SLOW_BURN_WINDOW_HOURS).toBeLessThan(complianceHours);
  });
});

describe("worker liveness timeout", () => {
  it("is a multiple of the heartbeat interval greater than 1x (tolerates a missed beat)", () => {
    // Exactly 1x the interval means a single delayed heartbeat (GC pause,
    // network jitter) falsely reports the worker as dead.
    expect(WORKER_LIVENESS_TIMEOUT_MS).toBeGreaterThan(
      WORKER_HEARTBEAT_INTERVAL_MS,
    );
    expect(WORKER_LIVENESS_TIMEOUT_MS % WORKER_HEARTBEAT_INTERVAL_MS).toBe(0);
  });
});

describe("MIN_EVENTS_FOR_SLI", () => {
  it("is positive — a zero threshold would defeat the insufficient-data guard", () => {
    expect(MIN_EVENTS_FOR_SLI).toBeGreaterThan(0);
  });
});

describe("SLO_LATENCY_THRESHOLD_MS", () => {
  it("is positive", () => {
    expect(SLO_LATENCY_THRESHOLD_MS).toBeGreaterThan(0);
  });
});

describe("error budget status thresholds", () => {
  it("critical ratio is 1 — the budget is fully consumed, the SLO is missed this window", () => {
    expect(ERROR_BUDGET_CRITICAL_RATIO).toBe(1);
  });

  it("warning ratio is 0.75 — three quarters of the budget gone with the window still open", () => {
    expect(ERROR_BUDGET_WARNING_RATIO).toBe(0.75);
  });

  it("warning is strictly below critical", () => {
    expect(ERROR_BUDGET_WARNING_RATIO).toBeLessThan(
      ERROR_BUDGET_CRITICAL_RATIO,
    );
  });
});
