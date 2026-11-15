import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreate = vi.fn();
const mockAcquireLock = vi.fn();
vi.mock("../../planner/repositories/trip.repository", () => ({
  tripRepository: {
    create: (...args: unknown[]) => mockCreate(...args),
    acquireLock: (...args: unknown[]) => mockAcquireLock(...args),
  },
}));

const mockAdd = vi.fn();
vi.mock("../../planner/trip.queue", () => ({
  tripQueue: { add: (...args: unknown[]) => mockAdd(...args) },
  TRIP_JOB_OPTIONS: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
}));

import { enqueueRealTripJobs, SEED_USER_ID } from "./seed-real-trip-jobs";

describe("enqueueRealTripJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockCreate.mockImplementation(async () => ({
      _id: { toString: () => "trip-x" },
    }));
    mockAdd.mockImplementation(async () => ({ id: "job-x" }));
    mockAcquireLock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueues exactly `count` jobs, bypassing Clerk entirely", async () => {
    const promise = enqueueRealTripJobs({
      count: 3,
      intervalMs: 1000,
      userTier: "free",
    });
    await vi.runAllTimersAsync();
    const enqueued = await promise;

    expect(enqueued).toBe(3);
    expect(mockAdd).toHaveBeenCalledTimes(3);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("sets userTier explicitly in the job payload — no Clerk/User lookup involved", async () => {
    const promise = enqueueRealTripJobs({
      count: 1,
      intervalMs: 1000,
      userTier: "pro",
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(mockAdd).toHaveBeenCalledWith(
      "generate-trip",
      expect.objectContaining({ userTier: "pro", userId: SEED_USER_ID }),
      expect.any(Object),
    );
  });

  it("spaces enqueues by intervalMs — not all fired at once", async () => {
    const timestamps: number[] = [];
    mockAdd.mockImplementation(async () => {
      timestamps.push(Date.now());
      return { id: "job-x" };
    });

    const promise = enqueueRealTripJobs({
      count: 3,
      intervalMs: 5000,
      userTier: "free",
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(timestamps).toHaveLength(3);
    expect(timestamps[1]! - timestamps[0]!).toBe(5000);
    expect(timestamps[2]! - timestamps[1]!).toBe(5000);
  });

  it("rotates through preference variants instead of enqueueing identical jobs", async () => {
    const promise = enqueueRealTripJobs({
      count: 4,
      intervalMs: 1000,
      userTier: "free",
      variants: [
        {
          destination: "A",
          startDate: "2026-09-01T00:00:00.000Z",
          endDate: "2026-09-02T00:00:00.000Z",
          budget: { total: 100, currency: "USD" },
          travelers: { adults: 1, children: 0 },
        } as never,
        {
          destination: "B",
          startDate: "2026-09-01T00:00:00.000Z",
          endDate: "2026-09-02T00:00:00.000Z",
          budget: { total: 100, currency: "USD" },
          travelers: { adults: 1, children: 0 },
        } as never,
      ],
    });
    await vi.runAllTimersAsync();
    await promise;

    const destinations = mockAdd.mock.calls.map(
      (call) =>
        (call[1] as { preferences: { destination: string } }).preferences
          .destination,
    );
    expect(destinations).toEqual(["A", "B", "A", "B"]);
  });

  it("carries the original job's priority for pro users (1) vs free (10)", async () => {
    const promise = enqueueRealTripJobs({
      count: 1,
      intervalMs: 1000,
      userTier: "pro",
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(mockAdd).toHaveBeenCalledWith(
      "generate-trip",
      expect.any(Object),
      expect.objectContaining({ priority: 1 }),
    );
  });
});
