import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SLO_WINDOW_DAYS,
  FAST_BURN_WINDOW_HOURS,
  SLOW_BURN_WINDOW_HOURS,
} from "@travelplan/shared";

const mockCountByOutcome = vi.fn();
const mockCountSlowCompleted = vi.fn();
const mockFindLatencySamples = vi.fn();
vi.mock("../repositories/job-metric.repository", () => ({
  jobMetricRepository: {
    countByOutcome: (...args: unknown[]) => mockCountByOutcome(...args),
    countSlowCompleted: (...args: unknown[]) => mockCountSlowCompleted(...args),
    findLatencySamples: (...args: unknown[]) => mockFindLatencySamples(...args),
  },
}));

const mockGetSaturationSignal = vi.fn();
vi.mock("./queue-saturation.service", () => ({
  getSaturationSignal: (...args: unknown[]) => mockGetSaturationSignal(...args),
}));

import { buildSloReport } from "./slo-report.service";

const emptyOutcomeCounts = { completed: 0, fallback: 0, failed: 0 };
const emptySaturation = {
  queues: [],
  workerAlive: true,
  lastHeartbeatAt: null,
  stalledCount: 0,
};

describe("buildSloReport — window boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountByOutcome.mockResolvedValue(emptyOutcomeCounts);
    mockCountSlowCompleted.mockResolvedValue(0);
    mockFindLatencySamples.mockResolvedValue([]);
    mockGetSaturationSignal.mockResolvedValue(emptySaturation);
  });

  it("queries the compliance window as [now - SLO_WINDOW_DAYS, now]", async () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    await buildSloReport({ now });

    const expectedSince = new Date(
      now.getTime() - SLO_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(mockCountByOutcome).toHaveBeenCalledWith(
      expect.any(String),
      expectedSince,
      now,
    );
  });

  it("queries the fast-burn window as [now - FAST_BURN_WINDOW_HOURS, now]", async () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    await buildSloReport({ now });

    const expectedSince = new Date(
      now.getTime() - FAST_BURN_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const calls = mockCountByOutcome.mock.calls as [string, Date, Date][];
    const fastBurnCall = calls.find(
      ([, since]) => since.getTime() === expectedSince.getTime(),
    );
    expect(fastBurnCall).toBeDefined();
  });

  it("queries the slow-burn window as [now - SLOW_BURN_WINDOW_HOURS, now]", async () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    await buildSloReport({ now });

    const expectedSince = new Date(
      now.getTime() - SLOW_BURN_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const calls = mockCountByOutcome.mock.calls as [string, Date, Date][];
    const slowBurnCall = calls.find(
      ([, since]) => since.getTime() === expectedSince.getTime(),
    );
    expect(slowBurnCall).toBeDefined();
  });

  it("defaults to the trip-generation queue when none is given", async () => {
    await buildSloReport({});
    expect(mockCountByOutcome).toHaveBeenCalledWith(
      "trip-generation",
      expect.any(Date),
      expect.any(Date),
    );
  });

  it("honors a windowDays override for the compliance window only — burn windows stay fixed", async () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    await buildSloReport({ now, windowDays: 7 });

    const expectedSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(mockCountByOutcome).toHaveBeenCalledWith(
      expect.any(String),
      expectedSince,
      now,
    );

    const fastBurnExpectedSince = new Date(
      now.getTime() - FAST_BURN_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const calls = mockCountByOutcome.mock.calls as [string, Date, Date][];
    const fastBurnCall = calls.find(
      ([, since]) => since.getTime() === fastBurnExpectedSince.getTime(),
    );
    expect(fastBurnCall).toBeDefined();
  });
});

describe("buildSloReport — honest SLI end to end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountSlowCompleted.mockResolvedValue(0);
    mockFindLatencySamples.mockResolvedValue([]);
    mockGetSaturationSignal.mockResolvedValue(emptySaturation);
  });

  it("returns insufficientData: true with no NaN/500 when there are zero recorded events", async () => {
    mockCountByOutcome.mockResolvedValue(emptyOutcomeCounts);

    const report = await buildSloReport({});

    expect(report.windows.compliance.sli.insufficientData).toBe(true);
    expect(report.windows.compliance.sli.sli).toBeNull();
    expect(
      Number.isNaN(report.windows.compliance.errorBudget.consumedRatio),
    ).toBe(false);
  });

  it("computes sli === 0.9 for 90 completed / 5 fallback / 5 failed (100 valid events)", async () => {
    mockCountByOutcome.mockResolvedValue({
      completed: 90,
      fallback: 5,
      failed: 5,
    });

    const report = await buildSloReport({});

    expect(report.windows.compliance.sli.sli).toBe(0.9);
    expect(report.windows.compliance.sli.validEvents).toBe(100);
  });

  it("reports fallbackRate and failureRate separately in the errors signal", async () => {
    mockCountByOutcome.mockResolvedValue({
      completed: 90,
      fallback: 5,
      failed: 5,
    });

    const report = await buildSloReport({});

    expect(report.signals.errors.fallbackRate).toBeCloseTo(0.05);
    expect(report.signals.errors.failureRate).toBeCloseTo(0.05);
  });
});

describe("buildSloReport — assembly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountByOutcome.mockResolvedValue({
      completed: 90,
      fallback: 5,
      failed: 5,
    });
    mockCountSlowCompleted.mockResolvedValue(0);
    mockGetSaturationSignal.mockResolvedValue(emptySaturation);
  });

  it("computes latency percentiles from the raw samples", async () => {
    mockFindLatencySamples.mockResolvedValue([
      { queueWaitMs: 100, processingMs: 200, endToEndMs: 300 },
      { queueWaitMs: 200, processingMs: 400, endToEndMs: 600 },
    ]);

    const report = await buildSloReport({});

    expect(report.signals.latency.endToEndMs.count).toBe(2);
    expect(report.signals.latency.endToEndMs.max).toBe(600);
  });

  it("passes saturation through from queue-saturation.service", async () => {
    mockFindLatencySamples.mockResolvedValue([]);
    mockGetSaturationSignal.mockResolvedValue({
      queues: [],
      workerAlive: false,
      lastHeartbeatAt: null,
      stalledCount: 2,
    });

    const report = await buildSloReport({});

    expect(report.signals.saturation.workerAlive).toBe(false);
    expect(report.signals.saturation.stalledCount).toBe(2);
  });

  it("stamps success:true and a valid generatedAt ISO string", async () => {
    mockFindLatencySamples.mockResolvedValue([]);
    const now = new Date("2026-08-24T00:00:00.000Z");

    const report = await buildSloReport({ now });

    expect(report.success).toBe(true);
    expect(report.generatedAt).toBe(now.toISOString());
  });
});
