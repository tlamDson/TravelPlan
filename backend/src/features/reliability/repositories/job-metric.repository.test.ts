import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdateOne = vi.fn();
const mockAggregate = vi.fn();
const mockFind = vi.fn();
const mockCountDocuments = vi.fn();

vi.mock("../models/JobMetric", () => ({
  default: {
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
    aggregate: (...args: unknown[]) => mockAggregate(...args),
    find: (...args: unknown[]) => mockFind(...args),
    countDocuments: (...args: unknown[]) => mockCountDocuments(...args),
  },
}));

import { jobMetricRepository } from "./job-metric.repository";

const sampleInput = {
  queue: "trip-generation",
  jobName: "generate-trip",
  jobId: "job-1",
  outcome: "completed" as const,
  attemptsMade: 1,
  queueWaitMs: 100,
  processingMs: 200,
  endToEndMs: 300,
  finishedAt: new Date("2026-08-24T00:00:00.000Z"),
};

describe("jobMetricRepository.record", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateOne.mockResolvedValue({ acknowledged: true });
  });

  it("upserts keyed on {queue, jobId} — not a plain insert", () => {
    jobMetricRepository.record(sampleInput);

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { queue: "trip-generation", jobId: "job-1" },
      expect.any(Object),
      expect.objectContaining({ upsert: true }),
    );
  });

  it("swallows a duplicate-key error (E11000) as a benign race, not a failure", async () => {
    const dupError = Object.assign(new Error("duplicate key"), { code: 11000 });
    mockUpdateOne.mockRejectedValueOnce(dupError);

    await expect(
      jobMetricRepository.record(sampleInput),
    ).resolves.not.toThrow();
  });

  it("re-throws a non-duplicate-key error", async () => {
    mockUpdateOne.mockRejectedValueOnce(new Error("connection reset"));

    await expect(jobMetricRepository.record(sampleInput)).rejects.toThrow(
      "connection reset",
    );
  });
});

describe("jobMetricRepository.findLatencySamples", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = {
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    };
    mockFind.mockReturnValue(chain);
  });

  it("projects to only the three latency fields, never loading the whole document", () => {
    jobMetricRepository.findLatencySamples(
      "trip-generation",
      new Date(0),
      new Date(1),
    );

    const [, projection] = mockFind.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(projection).toEqual({
      queueWaitMs: 1,
      processingMs: 1,
      endToEndMs: 1,
      _id: 0,
    });
  });

  it("applies a hard limit so a huge window can't load unbounded documents into memory", () => {
    jobMetricRepository.findLatencySamples(
      "trip-generation",
      new Date(0),
      new Date(1),
      500,
    );

    const returned = mockFind.mock.results[0]?.value;
    expect(returned.limit).toHaveBeenCalledWith(500);
  });

  it("defaults the limit to 5000 when not specified", () => {
    jobMetricRepository.findLatencySamples(
      "trip-generation",
      new Date(0),
      new Date(1),
    );
    const returned = mockFind.mock.results[0]?.value;
    expect(returned.limit).toHaveBeenCalledWith(5000);
  });
});

describe("jobMetricRepository.countByOutcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero-filled counts for outcomes with no matching documents", async () => {
    mockAggregate.mockResolvedValue([{ _id: "completed", count: 5 }]);

    const result = await jobMetricRepository.countByOutcome(
      "trip-generation",
      new Date(0),
      new Date(1),
    );

    expect(result).toEqual({ completed: 5, fallback: 0, failed: 0 });
  });
});

describe("jobMetricRepository.countByFailureReason", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates non-completed jobs grouped by failureReason", async () => {
    mockAggregate.mockResolvedValue([
      { _id: "AI_QUOTA", count: 4 },
      { _id: "VALIDATION_FAILED", count: 1 },
    ]);

    const result = await jobMetricRepository.countByFailureReason(
      "trip-generation",
      new Date(0),
      new Date(1),
    );

    expect(mockAggregate).toHaveBeenCalledWith([
      {
        $match: {
          queue: "trip-generation",
          finishedAt: { $gte: new Date(0), $lt: new Date(1) },
          outcome: { $ne: "completed" },
        },
      },
      { $group: { _id: "$failureReason", count: { $sum: 1 } } },
    ]);
    expect(result).toEqual({ AI_QUOTA: 4, VALIDATION_FAILED: 1 });
  });

  it("labels a missing failureReason as UNKNOWN instead of dropping it", async () => {
    mockAggregate.mockResolvedValue([{ _id: null, count: 2 }]);

    const result = await jobMetricRepository.countByFailureReason(
      "trip-generation",
      new Date(0),
      new Date(1),
    );

    expect(result).toEqual({ UNKNOWN: 2 });
  });

  it("returns an empty object when there are no non-completed jobs", async () => {
    mockAggregate.mockResolvedValue([]);

    const result = await jobMetricRepository.countByFailureReason(
      "trip-generation",
      new Date(0),
      new Date(1),
    );

    expect(result).toEqual({});
  });
});

describe("jobMetricRepository.countSlowCompleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountDocuments.mockResolvedValue(3);
  });

  it("counts only completed jobs slower than the given threshold", async () => {
    const result = await jobMetricRepository.countSlowCompleted(
      "trip-generation",
      new Date(0),
      new Date(1),
      180_000,
    );

    expect(mockCountDocuments).toHaveBeenCalledWith({
      queue: "trip-generation",
      finishedAt: { $gte: new Date(0), $lt: new Date(1) },
      outcome: "completed",
      endToEndMs: { $gt: 180_000 },
    });
    expect(result).toBe(3);
  });
});
