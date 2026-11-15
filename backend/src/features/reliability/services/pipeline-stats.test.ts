import { describe, it, expect } from "vitest";
import {
  bucketPerDay,
  latencyWindows,
  splitAtBoundary,
  stallSummary,
  type PipelineJobRecord,
} from "./pipeline-stats";

const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date("2026-01-01T00:00:00.000Z").getTime();

function job(overrides: Partial<PipelineJobRecord> = {}): PipelineJobRecord {
  return {
    id: "job-1",
    name: "generate-trip",
    timestamp: BASE,
    processedOn: BASE + 1000,
    finishedOn: BASE + 5000,
    attemptsMade: 1,
    stalledCounter: 0,
    failedReason: null,
    finishedStatus: "completed",
    ...overrides,
  };
}

describe("bucketPerDay", () => {
  it("3 jobs on day 0, 1 job on day 2 (day 1 has zero traffic) — spans 3 days total", () => {
    const jobs: PipelineJobRecord[] = [
      job({ id: "a", timestamp: BASE }),
      job({ id: "b", timestamp: BASE + 1000 }),
      job({ id: "c", timestamp: BASE + 2000 }),
      job({ id: "d", timestamp: BASE + 2 * DAY }),
    ];
    const result = bucketPerDay(jobs);

    expect(result.totalJobs).toBe(4);
    // earliest day.01, latest day.03 → inclusive span = 3 days
    expect(result.totalDays).toBe(3);
    expect(result.daysWithTraffic).toBe(2);
    expect(result.peakPerDay).toBe(3);
    expect(result.averagePerDayAll).toBeCloseTo(4 / 3, 10);
    expect(result.averagePerDayWithTraffic).toBeCloseTo(4 / 2, 10);
  });

  it("empty input → all zeros, no division by zero", () => {
    const result = bucketPerDay([]);
    expect(result.totalJobs).toBe(0);
    expect(result.totalDays).toBe(0);
    expect(result.daysWithTraffic).toBe(0);
    expect(result.peakPerDay).toBe(0);
    expect(result.averagePerDayAll).toBe(0);
    expect(result.averagePerDayWithTraffic).toBe(0);
  });

  it("a single job on a single day → totalDays=1, averages equal totalJobs", () => {
    const result = bucketPerDay([job({ timestamp: BASE })]);
    expect(result.totalDays).toBe(1);
    expect(result.daysWithTraffic).toBe(1);
    expect(result.averagePerDayAll).toBe(1);
    expect(result.averagePerDayWithTraffic).toBe(1);
  });
});

describe("latencyWindows", () => {
  it("computes queueWait/processing/endToEnd per job and skips jobs missing processedOn/finishedOn", () => {
    const jobs: PipelineJobRecord[] = [
      job({
        id: "complete",
        timestamp: BASE,
        processedOn: BASE + 2000, // queueWait = 2000
        finishedOn: BASE + 7000, // processing = 5000, endToEnd = 7000
      }),
      job({
        id: "never-processed",
        timestamp: BASE,
        processedOn: null,
        finishedOn: null,
      }),
    ];
    const result = latencyWindows(jobs);
    expect(result.queueWaitMs).toEqual([2000]);
    expect(result.processingMs).toEqual([5000]);
    expect(result.endToEndMs).toEqual([7000]);
  });

  it("empty input → three empty arrays", () => {
    const result = latencyWindows([]);
    expect(result.queueWaitMs).toEqual([]);
    expect(result.processingMs).toEqual([]);
    expect(result.endToEndMs).toEqual([]);
  });
});

describe("splitAtBoundary", () => {
  const boundary = BASE + DAY;

  it("splits strictly by timestamp — before is < boundary, after is >= boundary", () => {
    const jobs: PipelineJobRecord[] = [
      job({ id: "a", timestamp: boundary - 1 }),
      job({ id: "b", timestamp: boundary }),
      job({ id: "c", timestamp: boundary + 1 }),
    ];
    const result = splitAtBoundary(jobs, boundary);
    expect(result.before.map((j) => j.id)).toEqual(["a"]);
    expect(result.after.map((j) => j.id)).toEqual(["b", "c"]);
  });

  it("empty input → empty before/after", () => {
    const result = splitAtBoundary([], boundary);
    expect(result.before).toEqual([]);
    expect(result.after).toEqual([]);
  });
});

describe("stallSummary", () => {
  it("counts jobs with stalledCounter > 0 and jobs that failed with the stalled-limit reason", () => {
    const jobs: PipelineJobRecord[] = [
      job({ id: "a", stalledCounter: 0 }),
      job({ id: "b", stalledCounter: 1 }),
      job({
        id: "c",
        stalledCounter: 2,
        finishedStatus: "failed",
        failedReason: "job stalled more than allowable limit",
      }),
      job({
        id: "d",
        stalledCounter: 0,
        finishedStatus: "failed",
        failedReason: "some other error",
      }),
    ];
    const result = stallSummary(jobs);
    expect(result.totalJobs).toBe(4);
    expect(result.stalledJobs).toBe(2);
    expect(result.stalledFailures).toBe(1);
  });

  it("empty input → all zeros", () => {
    const result = stallSummary([]);
    expect(result.totalJobs).toBe(0);
    expect(result.stalledJobs).toBe(0);
    expect(result.stalledFailures).toBe(0);
  });

  it("treats missing stalledCounter/failedReason as absent, not a crash", () => {
    // Built directly (not via job()) so stalledCounter/failedReason are
    // genuinely omitted, matching a real BullMQ job whose `stc` hash field
    // was never set — exactOptionalPropertyTypes rejects passing
    // `undefined` explicitly for these optional fields.
    const jobs: PipelineJobRecord[] = [
      {
        id: "a",
        name: "generate-trip",
        timestamp: BASE,
        processedOn: null,
        finishedOn: null,
        finishedStatus: "completed",
      },
    ];
    const result = stallSummary(jobs);
    expect(result.stalledJobs).toBe(0);
    expect(result.stalledFailures).toBe(0);
  });
});
