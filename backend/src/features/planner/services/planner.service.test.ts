import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repositories/trip.repository", () => ({
  tripRepository: { create: vi.fn(), acquireLock: vi.fn() },
}));
vi.mock("../../user/repositories/user.repository", () => ({
  userRepository: { findByClerkId: vi.fn() },
}));
vi.mock("../trip.queue", () => ({
  tripQueue: { add: vi.fn() },
  TRIP_JOB_OPTIONS: {},
}));
vi.mock("../../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { plannerService } from "./planner.service";
import { TripRequestError } from "../errors";
import { tripRepository } from "../repositories/trip.repository";
import { userRepository } from "../../user/repositories/user.repository";
import { tripQueue } from "../trip.queue";

const prefs = (over: Record<string, unknown> = {}) =>
  ({
    destination: "Hanoi, Vietnam",
    startDate: "2026-12-01T00:00:00.000Z",
    endDate: "2026-12-04T00:00:00.000Z",
    budget: { total: 3000, currency: "USD" },
    travelers: { adults: 1, children: 0 },
    ...over,
  }) as any;

describe("createTripGenerationJob rejections are TripRequestError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A user lookup here would run after the idempotency key is reserved;
    // the service must take the tier from its caller instead.
    vi.mocked(userRepository.findByClerkId).mockRejectedValue(
      new Error("user lookup must not happen in the service"),
    );
  });

  it("throws TripRequestError for a too-short duration", async () => {
    await expect(
      plannerService.createTripGenerationJob({
        userId: "u1",
        userTier: "free",
        preferences: prefs({ endDate: "2026-12-01T00:00:00.000Z" }),
      }),
    ).rejects.toBeInstanceOf(TripRequestError);
  });

  it("throws TripRequestError for an impossible budget", async () => {
    await expect(
      plannerService.createTripGenerationJob({
        userId: "u1",
        userTier: "free",
        preferences: prefs({ budget: { total: 1, currency: "USD" } }),
      }),
    ).rejects.toBeInstanceOf(TripRequestError);
  });

  it("throws TripRequestError when a free user exceeds the day cap", async () => {
    await expect(
      plannerService.createTripGenerationJob({
        userId: "u1",
        userTier: "free",
        preferences: prefs({
          endDate: "2026-12-11T00:00:00.000Z",
          budget: { total: 100000, currency: "USD" },
        }),
      }),
    ).rejects.toThrow(/maximum of 5 days/);
    await expect(
      plannerService.createTripGenerationJob({
        userId: "u1",
        userTier: "free",
        preferences: prefs({
          endDate: "2026-12-11T00:00:00.000Z",
          budget: { total: 100000, currency: "USD" },
        }),
      }),
    ).rejects.toBeInstanceOf(TripRequestError);
    expect(tripRepository.create).not.toHaveBeenCalled();
  });

  it("does not wrap an infrastructure failure as TripRequestError", async () => {
    vi.mocked(tripRepository.create).mockRejectedValue(new Error("mongo down"));
    const err = await plannerService
      .createTripGenerationJob({
        userId: "u1",
        userTier: "free",
        preferences: prefs(),
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TripRequestError);
  });

  it("applies the caller's tier to the day cap without looking the user up", async () => {
    vi.mocked(tripRepository.create).mockResolvedValue({ _id: "trip1" } as any);
    vi.mocked(tripQueue.add).mockResolvedValue({ id: "job1" } as any);
    const result = await plannerService.createTripGenerationJob({
      userId: "u1",
      userTier: "pro",
      preferences: prefs({
        endDate: "2026-12-11T00:00:00.000Z",
        budget: { total: 100000, currency: "USD" },
      }),
    });

    expect(result).toEqual({ tripId: "trip1", jobId: "job1" });
    expect(userRepository.findByClerkId).not.toHaveBeenCalled();
    expect(tripQueue.add).toHaveBeenCalledWith(
      "generate-trip",
      expect.objectContaining({ userTier: "pro" }),
      expect.objectContaining({ priority: 1 }),
    );
  });
});
