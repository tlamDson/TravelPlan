import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTripGetJobCounts = vi.fn();
vi.mock("../../planner/trip.queue", () => ({
  tripQueue: {
    getJobCounts: (...args: unknown[]) => mockTripGetJobCounts(...args),
  },
}));

const mockCalendarGetJobCounts = vi.fn();
vi.mock("../../calendar/calendar.queue", () => ({
  calendarSyncQueue: {
    getJobCounts: (...args: unknown[]) => mockCalendarGetJobCounts(...args),
  },
}));

const mockInsightGetJobCounts = vi.fn();
vi.mock("../../destinations/jobs/insight-queue", () => ({
  insightQueue: {
    getJobCounts: (...args: unknown[]) => mockInsightGetJobCounts(...args),
  },
}));

const mockFindAll = vi.fn();
vi.mock("../repositories/worker-heartbeat.repository", () => ({
  workerHeartbeatRepository: {
    findAll: (...args: unknown[]) => mockFindAll(...args),
  },
}));

import { getSaturationSignal } from "./queue-saturation.service";
import { WORKER_LIVENESS_TIMEOUT_MS } from "@travelplan/shared";

const emptyCounts = { waiting: 0, active: 0, delayed: 0, failed: 0, paused: 0 };

describe("getSaturationSignal — per-queue counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTripGetJobCounts.mockResolvedValue(emptyCounts);
    mockCalendarGetJobCounts.mockResolvedValue(emptyCounts);
    mockInsightGetJobCounts.mockResolvedValue(emptyCounts);
    mockFindAll.mockResolvedValue([]);
  });

  it("computes utilisation === 1 when active equals concurrency", async () => {
    mockTripGetJobCounts.mockResolvedValue({ ...emptyCounts, active: 5 }); // TRIP_GENERATION concurrency is 5

    const signal = await getSaturationSignal();
    const trip = signal.queues.find((q) => q.name === "trip-generation");

    expect(trip?.utilisation).toBe(1);
  });

  it("returns error:true for one queue whose getJobCounts() rejects, without failing the whole report", async () => {
    mockTripGetJobCounts.mockRejectedValue(new Error("Redis hiccup"));

    const signal = await getSaturationSignal();
    const trip = signal.queues.find((q) => q.name === "trip-generation");
    const calendar = signal.queues.find(
      (q) => q.name === "sync-google-calendar",
    );

    expect(trip?.error).toBe(true);
    expect(calendar?.error).toBeUndefined();
    expect(signal.queues).toHaveLength(3);
  });

  it("carries waiting/active/delayed/failed/paused through for a healthy queue", async () => {
    mockCalendarGetJobCounts.mockResolvedValue({
      waiting: 2,
      active: 1,
      delayed: 0,
      failed: 3,
      paused: 0,
    });

    const signal = await getSaturationSignal();
    const calendar = signal.queues.find(
      (q) => q.name === "sync-google-calendar",
    );

    expect(calendar).toMatchObject({
      waiting: 2,
      active: 1,
      delayed: 0,
      failed: 3,
      paused: 0,
    });
  });
});

describe("getSaturationSignal — worker liveness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTripGetJobCounts.mockResolvedValue(emptyCounts);
    mockCalendarGetJobCounts.mockResolvedValue(emptyCounts);
    mockInsightGetJobCounts.mockResolvedValue(emptyCounts);
  });

  it("workerAlive is true when at least one heartbeat is within the liveness timeout", async () => {
    const now = new Date(1_000_000);
    mockFindAll.mockResolvedValue([
      { lastBeatAt: new Date(now.getTime() - 1000) },
    ]);

    const signal = await getSaturationSignal(now);
    expect(signal.workerAlive).toBe(true);
  });

  it("workerAlive is false when every heartbeat is past the liveness timeout", async () => {
    const now = new Date(1_000_000);
    mockFindAll.mockResolvedValue([
      { lastBeatAt: new Date(now.getTime() - WORKER_LIVENESS_TIMEOUT_MS - 1) },
    ]);

    const signal = await getSaturationSignal(now);
    expect(signal.workerAlive).toBe(false);
  });

  it("workerAlive is false and lastHeartbeatAt is null when no worker has ever reported in", async () => {
    mockFindAll.mockResolvedValue([]);

    const signal = await getSaturationSignal();
    expect(signal.workerAlive).toBe(false);
    expect(signal.lastHeartbeatAt).toBeNull();
  });

  it("sums stalledCount across all heartbeat documents", async () => {
    mockFindAll.mockResolvedValue([
      { lastBeatAt: new Date(), stalledCount: 2 },
      { lastBeatAt: new Date(), stalledCount: 3 },
    ]);

    const signal = await getSaturationSignal();
    expect(signal.stalledCount).toBe(5);
  });
});
