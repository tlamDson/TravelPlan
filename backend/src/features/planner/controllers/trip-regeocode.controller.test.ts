import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";

vi.mock("../repositories/trip.repository", () => ({
  tripRepository: { findById: vi.fn() },
}));
vi.mock("../services/validation.service", () => ({
  validationService: { validateIntent: vi.fn() },
}));
vi.mock("../../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { reGeocodeTrip } from "./trip-regeocode.controller";
import { tripRepository } from "../repositories/trip.repository";
import { validationService } from "../services/validation.service";

const validated = {
  name: "Minh Khai Botanical Garden",
  coordinates: [105.85, 21.0] as [number, number],
};

const makeTrip = (over: Record<string, unknown> = {}) => ({
  userId: "user_1",
  title: "My Summer Vacation",
  destination: "Hanoi, Vietnam",
  itinerary: [
    {
      activities: [{ name: "Minh Khai Botanical Garden" } as any],
    },
  ],
  save: vi.fn().mockResolvedValue(undefined),
  ...over,
});

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};

const makeReq = () =>
  ({
    params: { tripId: "t1" },
    auth: () => ({ userId: "user_1" }),
  }) as any;

describe("reGeocodeTrip destination context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validationService.validateIntent).mockResolvedValue(
      validated as any,
    );
  });

  it("uses trip.destination, not the title, and passes the bare activity name", async () => {
    vi.mocked(tripRepository.findById).mockResolvedValue(makeTrip() as any);

    await reGeocodeTrip(makeReq(), makeRes());

    expect(validationService.validateIntent).toHaveBeenCalledTimes(1);
    expect(validationService.validateIntent).toHaveBeenCalledWith(
      "Minh Khai Botanical Garden",
      "Hanoi, Vietnam",
    );
  });

  it("falls back to the title's first segment when destination is empty", async () => {
    vi.mocked(tripRepository.findById).mockResolvedValue(
      makeTrip({ title: "Hanoi - 3 days", destination: "" }) as any,
    );

    await reGeocodeTrip(makeReq(), makeRes());

    expect(validationService.validateIntent).toHaveBeenCalledWith(
      "Minh Khai Botanical Garden",
      "Hanoi",
    );
  });

  it("falls back to the title when destination is undefined", async () => {
    vi.mocked(tripRepository.findById).mockResolvedValue(
      makeTrip({ title: "Hanoi, Vietnam", destination: undefined }) as any,
    );

    await reGeocodeTrip(makeReq(), makeRes());

    expect(validationService.validateIntent).toHaveBeenCalledWith(
      "Minh Khai Botanical Garden",
      "Hanoi",
    );
  });
});
