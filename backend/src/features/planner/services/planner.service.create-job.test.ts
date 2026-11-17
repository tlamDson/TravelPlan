import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repositories/trip.repository", () => ({
  tripRepository: { create: vi.fn(), acquireLock: vi.fn() },
}));
vi.mock("../../user/repositories/user.repository", () => ({
  userRepository: { findByClerkId: vi.fn() },
}));
vi.mock("./budget-validator.service", () => ({
  budgetValidatorService: { validateDuration: vi.fn(), validate: vi.fn() },
}));
vi.mock("../trip.queue", () => ({
  tripQueue: { add: vi.fn() },
  TRIP_JOB_OPTIONS: {},
}));
vi.mock("./trip-status.service", () => ({
  getJobStatusForUser: vi.fn(),
  retryTripJobForUser: vi.fn(),
  getTripByIdFromRepo: vi.fn(),
  getUserTripsList: vi.fn(),
  cancelTripJobForUser: vi.fn(),
  cancelTripForUser: vi.fn(),
}));
vi.mock("../../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { plannerService } from "./planner.service";
import { TripRequestRejectedError } from "./trip-request-rejected.error";
import { budgetValidatorService } from "./budget-validator.service";
import { tripRepository } from "../repositories/trip.repository";
import { userRepository } from "../../user/repositories/user.repository";

const params = {
  userId: "user-1",
  preferences: {
    destination: "Hanoi",
    startDate: "2026-06-01T00:00:00.000Z",
    endDate: "2026-06-03T00:00:00.000Z",
    budget: { total: 100, currency: "USD" },
    travelers: { adults: 1, children: 0 },
  } as any,
};

describe("createTripGenerationJob error kinds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(budgetValidatorService.validateDuration).mockReturnValue({
      isValid: true,
      days: 3,
    } as any);
    vi.mocked(budgetValidatorService.validate).mockReturnValue({
      isValid: true,
    } as any);
    vi.mocked(userRepository.findByClerkId).mockResolvedValue({
      tier: "free",
    } as any);
  });

  it("rejects an invalid duration with TripRequestRejectedError, before any write", async () => {
    vi.mocked(budgetValidatorService.validateDuration).mockReturnValue({
      isValid: false,
      reason: "Trip too long",
    } as any);
    await expect(
      plannerService.createTripGenerationJob(params),
    ).rejects.toBeInstanceOf(TripRequestRejectedError);
    expect(tripRepository.create).not.toHaveBeenCalled();
  });

  it("rejects a budget below the floor with TripRequestRejectedError", async () => {
    vi.mocked(budgetValidatorService.validate).mockReturnValue({
      isValid: false,
      reason: "Budget too low per day",
    } as any);
    await expect(
      plannerService.createTripGenerationJob(params),
    ).rejects.toThrow(new TripRequestRejectedError("Budget too low per day"));
  });

  it("rejects a trip over the tier day cap with TripRequestRejectedError", async () => {
    vi.mocked(budgetValidatorService.validateDuration).mockReturnValue({
      isValid: true,
      days: 9,
    } as any);
    await expect(
      plannerService.createTripGenerationJob(params),
    ).rejects.toBeInstanceOf(TripRequestRejectedError);
  });

  it("does not label a failure during the writes as a rejection", async () => {
    vi.mocked(tripRepository.create).mockRejectedValue(new Error("Mongo down"));
    const err = await plannerService
      .createTripGenerationJob(params)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TripRequestRejectedError);
  });
});
