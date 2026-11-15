import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdateOne = vi.fn();
const mockFind = vi.fn();
vi.mock("../models/WorkerHeartbeat", () => ({
  default: {
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
    find: (...args: unknown[]) => mockFind(...args),
  },
}));

import { workerHeartbeatRepository } from "./worker-heartbeat.repository";

const sampleBeat = {
  workerId: "worker-1",
  host: "railway-worker-abc",
  queues: ["trip-generation"],
  concurrency: { "trip-generation": 5 },
  startedAt: new Date("2026-08-24T00:00:00.000Z"),
  lastBeatAt: new Date("2026-08-24T00:00:15.000Z"),
};

describe("workerHeartbeatRepository.upsertBeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateOne.mockResolvedValue({ acknowledged: true });
  });

  it("upserts keyed on workerId, refreshing the full document (not $setOnInsert)", async () => {
    // Unlike JobMetric's record-once semantics, a heartbeat must be
    // overwritten on every beat — lastBeatAt has to actually move forward.
    await workerHeartbeatRepository.upsertBeat(sampleBeat);

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { workerId: "worker-1" },
      { $set: sampleBeat },
      expect.objectContaining({ upsert: true }),
    );
  });
});

describe("workerHeartbeatRepository.incrementStalled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateOne.mockResolvedValue({ acknowledged: true });
  });

  it("increments stalledCount for the given workerId", async () => {
    await workerHeartbeatRepository.incrementStalled("worker-1");

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { workerId: "worker-1" },
      { $inc: { stalledCount: 1 } },
    );
  });
});

describe("workerHeartbeatRepository.findAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns every heartbeat document (leaned)", async () => {
    const lean = vi.fn().mockResolvedValue([sampleBeat]);
    mockFind.mockReturnValue({ lean });

    const result = await workerHeartbeatRepository.findAll();

    expect(mockFind).toHaveBeenCalledWith({});
    expect(lean).toHaveBeenCalled();
    expect(result).toEqual([sampleBeat]);
  });
});
