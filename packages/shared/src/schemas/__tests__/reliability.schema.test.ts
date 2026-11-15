import { describe, it, expect } from "vitest";
import {
  jobOutcomeSchema,
  sliResultSchema,
  errorBudgetSchema,
  latencyStatsSchema,
  goldenSignalsSchema,
  sloReportResponseSchema,
} from "../reliability.schema";

describe("jobOutcomeSchema", () => {
  it("accepts the three lowercase outcomes", () => {
    expect(jobOutcomeSchema.safeParse("completed").success).toBe(true);
    expect(jobOutcomeSchema.safeParse("fallback").success).toBe(true);
    expect(jobOutcomeSchema.safeParse("failed").success).toBe(true);
  });

  it("rejects uppercase — pins the wire casing so the recorder can't drift from BullMQ's own returnvalue.status casing", () => {
    expect(jobOutcomeSchema.safeParse("COMPLETED").success).toBe(false);
  });
});

describe("sliResultSchema", () => {
  const valid = {
    validEvents: 100,
    goodEvents: 90,
    badEvents: 10,
    sli: 0.9,
    insufficientData: false,
  };

  it("round-trips a valid result", () => {
    expect(sliResultSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects sli above 1", () => {
    expect(sliResultSchema.safeParse({ ...valid, sli: 1.1 }).success).toBe(
      false,
    );
  });

  it("rejects sli below 0", () => {
    expect(sliResultSchema.safeParse({ ...valid, sli: -0.1 }).success).toBe(
      false,
    );
  });

  it("allows sli: null for the insufficient-data case", () => {
    expect(
      sliResultSchema.safeParse({
        validEvents: 5,
        goodEvents: 5,
        badEvents: 0,
        sli: null,
        insufficientData: true,
      }).success,
    ).toBe(true);
  });

  it("rejects negative validEvents", () => {
    expect(
      sliResultSchema.safeParse({ ...valid, validEvents: -1 }).success,
    ).toBe(false);
  });

  it("rejects goodEvents + badEvents that don't sum to validEvents", () => {
    // A drifted sum is exactly the kind of silent bug an SLI contract
    // should catch at the boundary, not downstream in the math.
    expect(
      sliResultSchema.safeParse({ ...valid, goodEvents: 95 }).success,
    ).toBe(false);
  });
});

describe("errorBudgetSchema", () => {
  const valid = {
    target: 0.9,
    budgetTotal: 100,
    budgetConsumed: 60,
    budgetRemaining: 40,
    consumedRatio: 0.6,
    burnRate: 0.6,
    exhaustsAt: null,
  };

  it("round-trips a valid budget", () => {
    expect(errorBudgetSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts exhaustsAt: null (budget not on track to exhaust)", () => {
    expect(
      errorBudgetSchema.safeParse({ ...valid, exhaustsAt: null }).success,
    ).toBe(true);
  });

  it("accepts exhaustsAt as an ISO datetime string", () => {
    expect(
      errorBudgetSchema.safeParse({
        ...valid,
        exhaustsAt: "2026-09-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-ISO exhaustsAt string", () => {
    expect(
      errorBudgetSchema.safeParse({ ...valid, exhaustsAt: "next tuesday" })
        .success,
    ).toBe(false);
  });
});

describe("latencyStatsSchema", () => {
  it("round-trips valid percentile stats", () => {
    expect(
      latencyStatsSchema.safeParse({
        count: 42,
        p50: 800,
        p95: 4200,
        p99: 9000,
        max: 12000,
      }).success,
    ).toBe(true);
  });

  it("rejects a negative count", () => {
    expect(
      latencyStatsSchema.safeParse({
        count: -1,
        p50: 0,
        p95: 0,
        p99: 0,
        max: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-order percentiles (p95 lower than p50)", () => {
    expect(
      latencyStatsSchema.safeParse({
        count: 10,
        p50: 500,
        p95: 100,
        p99: 900,
        max: 1000,
      }).success,
    ).toBe(false);
  });
});

describe("goldenSignalsSchema", () => {
  const validLatencyStats = {
    count: 10,
    p50: 100,
    p95: 200,
    p99: 300,
    max: 400,
  };

  const valid = {
    latency: {
      queueWaitMs: validLatencyStats,
      processingMs: validLatencyStats,
      endToEndMs: validLatencyStats,
    },
    traffic: { totalJobs: 10, jobsPerHour: 0.4 },
    errors: {
      sli: {
        validEvents: 10,
        goodEvents: 9,
        badEvents: 1,
        sli: 0.9,
        insufficientData: false,
      },
      fallbackRate: 0.05,
      failureRate: 0.05,
    },
    saturation: {
      queues: [
        {
          name: "trip-generation",
          waiting: 2,
          active: 1,
          delayed: 0,
          failed: 0,
          paused: 0,
          concurrency: 5,
          utilisation: 0.2,
        },
      ],
      workerAlive: true,
      lastHeartbeatAt: "2026-08-24T00:00:00.000Z",
      stalledCount: 0,
    },
  };

  it("round-trips a fully-populated golden-signals payload", () => {
    expect(goldenSignalsSchema.safeParse(valid).success).toBe(true);
  });

  it("allows a per-queue error flag when getJobCounts() failed for that queue", () => {
    const withError = {
      ...valid,
      saturation: {
        ...valid.saturation,
        queues: [{ ...valid.saturation.queues[0], error: true }],
      },
    };
    expect(goldenSignalsSchema.safeParse(withError).success).toBe(true);
  });

  it("allows lastHeartbeatAt: null (no worker has ever reported in)", () => {
    const noHeartbeat = {
      ...valid,
      saturation: { ...valid.saturation, lastHeartbeatAt: null },
    };
    expect(goldenSignalsSchema.safeParse(noHeartbeat).success).toBe(true);
  });
});

describe("sloReportResponseSchema", () => {
  const windowReport = {
    sli: {
      validEvents: 100,
      goodEvents: 90,
      badEvents: 10,
      sli: 0.9,
      insufficientData: false,
    },
    errorBudget: {
      target: 0.9,
      budgetTotal: 10,
      budgetConsumed: 10,
      budgetRemaining: 0,
      consumedRatio: 1,
      burnRate: 1,
      exhaustsAt: null,
    },
  };

  const validLatencyStats = {
    count: 10,
    p50: 100,
    p95: 200,
    p99: 300,
    max: 400,
  };

  const valid = {
    success: true as const,
    generatedAt: "2026-08-24T00:00:00.000Z",
    windows: {
      compliance: windowReport,
      fastBurn: windowReport,
      slowBurn: windowReport,
    },
    signals: {
      latency: {
        queueWaitMs: validLatencyStats,
        processingMs: validLatencyStats,
        endToEndMs: validLatencyStats,
      },
      traffic: { totalJobs: 100, jobsPerHour: 4 },
      errors: {
        sli: windowReport.sli,
        fallbackRate: 0.05,
        failureRate: 0.05,
      },
      saturation: {
        queues: [],
        workerAlive: true,
        lastHeartbeatAt: null,
        stalledCount: 0,
      },
    },
  };

  it("round-trips a full report", () => {
    const result = sloReportResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects success: false (literal true required, matches destinationsListResponseSchema convention)", () => {
    expect(
      sloReportResponseSchema.safeParse({ ...valid, success: false }).success,
    ).toBe(false);
  });
});
