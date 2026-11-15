import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRecord = vi.fn();
vi.mock("../repositories/job-metric.repository", () => ({
  jobMetricRepository: {
    record: (...args: unknown[]) => mockRecord(...args),
  },
}));

import { attachJobMetrics } from "./attach-job-metrics";

/** A minimal fake standing in for a bullmq Worker — just enough surface
 * (`.on()` collecting handlers by event name, plus a way to fire them) to
 * exercise attachJobMetrics without constructing a real Worker/Redis
 * connection. */
function makeFakeWorker() {
  const handlers: Record<string, ((...args: unknown[]) => unknown)[]> = {};
  return {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      (handlers[event] ??= []).push(handler);
      return this;
    },
    async emit(event: string, ...args: unknown[]) {
      for (const handler of handlers[event] ?? []) {
        await handler(...args);
      }
    },
  };
}

const completedJob = {
  id: "job-1",
  name: "generate-trip",
  data: { tripId: "trip-1" },
  timestamp: 1000,
  processedOn: 1000,
  finishedOn: 2000,
  attemptsMade: 1,
  opts: { attempts: 3 },
  returnvalue: { status: "COMPLETED" },
};

describe("attachJobMetrics — completed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecord.mockResolvedValue(undefined);
  });

  it("records a metric on the completed event", async () => {
    const worker = makeFakeWorker();
    attachJobMetrics(worker as never, "trip-generation");

    await worker.emit("completed", completedJob);

    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "completed", jobId: "job-1" }),
    );
  });

  it("does not propagate when the repository rejects — measurement must never break the thing it measures", async () => {
    mockRecord.mockRejectedValueOnce(new Error("Mongo hiccup"));
    const worker = makeFakeWorker();
    attachJobMetrics(worker as never, "trip-generation");

    await expect(worker.emit("completed", completedJob)).resolves.not.toThrow();
  });
});

describe("attachJobMetrics — failed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecord.mockResolvedValue(undefined);
  });

  it("does NOT record when the job still has retries left (not terminal)", async () => {
    const worker = makeFakeWorker();
    attachJobMetrics(worker as never, "trip-generation");

    const retryableJob = {
      ...completedJob,
      attemptsMade: 1,
      opts: { attempts: 3 },
    };
    await worker.emit("failed", retryableJob, new Error("transient"));

    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("DOES record once retries are exhausted (terminal failure)", async () => {
    const worker = makeFakeWorker();
    attachJobMetrics(worker as never, "trip-generation");

    const exhaustedJob = {
      ...completedJob,
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    await worker.emit("failed", exhaustedJob, new Error("still failing"));

    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed" }),
    );
  });

  it("does nothing when job is undefined (BullMQ can emit failed with no job)", async () => {
    const worker = makeFakeWorker();
    attachJobMetrics(worker as never, "trip-generation");

    await expect(
      worker.emit("failed", undefined, new Error("no job")),
    ).resolves.not.toThrow();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("does not propagate when the repository rejects on a terminal failure", async () => {
    mockRecord.mockRejectedValueOnce(new Error("Mongo hiccup"));
    const worker = makeFakeWorker();
    attachJobMetrics(worker as never, "trip-generation");

    const exhaustedJob = {
      ...completedJob,
      attemptsMade: 3,
      opts: { attempts: 3 },
    };
    await expect(
      worker.emit("failed", exhaustedJob, new Error("still failing")),
    ).resolves.not.toThrow();
  });
});
