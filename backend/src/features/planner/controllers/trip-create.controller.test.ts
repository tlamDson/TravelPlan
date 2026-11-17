import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";

vi.mock("../services/planner.service", () => ({
  plannerService: { createTripGenerationJob: vi.fn() },
}));
vi.mock("../services/user-quota.service", () => ({
  userQuotaService: { canCreateTrip: vi.fn() },
}));
vi.mock("../../user/repositories/user.repository", () => ({
  userRepository: { findByClerkId: vi.fn() },
}));
vi.mock("../../user/models/IdempotencyLog", () => ({
  default: { create: vi.fn() },
}));
vi.mock("../../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { generateTrip } from "./trip-create.controller";
import { plannerService } from "../services/planner.service";
import { userQuotaService } from "../services/user-quota.service";
import { userRepository } from "../../user/repositories/user.repository";
import { logger } from "../../../lib/logger";

const SECRET_TEXT = "my-private-free-text-do-not-log";

const validPreferences = {
  destination: "Hanoi, Vietnam",
  startDate: "2026-12-01T00:00:00.000Z",
  endDate: "2026-12-03T00:00:00.000Z",
  budget: { total: 1000, currency: "USD" },
  travelers: { adults: 1, children: 0 },
};

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: any; json: any };
};

const makeReq = (body: unknown) =>
  ({
    body,
    headers: {},
    auth: () => ({ userId: "user_1" }),
  }) as any;

describe("generateTrip error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userQuotaService.canCreateTrip).mockResolvedValue({
      allowed: true,
      remaining: 5,
      limit: 10,
      resetAt: new Date(),
    } as any);
    vi.mocked(userRepository.findByClerkId).mockResolvedValue({
      tier: "free",
    } as any);
  });

  it("does not log the request body when validation fails", async () => {
    const res = makeRes();
    await generateTrip(
      makeReq({
        preferences: { destination: SECRET_TEXT },
        title: SECRET_TEXT,
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).not.toContain(SECRET_TEXT);
  });

  it("logs validation issue paths at warn level, not error", async () => {
    await generateTrip(
      makeReq({ preferences: { destination: SECRET_TEXT } }),
      makeRes(),
    );

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(logger.warn).mock.calls[0][0] as any;
    expect(payload.body).toBeUndefined();
    expect(Array.isArray(payload.paths)).toBe(true);
    expect(payload.paths.length).toBeGreaterThan(0);
  });

  it("returns 500 with a generic message for an infrastructure failure", async () => {
    vi.mocked(plannerService.createTripGenerationJob).mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:6379"),
    );
    const res = makeRes();

    await generateTrip(makeReq({ preferences: validPreferences }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toBe("Failed to start trip generation");
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
  });

  it("still returns 400 with the message for a rejected trip request", async () => {
    const { TripRequestError } = await import("../errors");
    vi.mocked(plannerService.createTripGenerationJob).mockRejectedValue(
      new TripRequestError("Your plan allows a maximum of 5 days per trip."),
    );
    const res = makeRes();

    await generateTrip(makeReq({ preferences: validPreferences }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toEqual({
      success: false,
      message: "Your plan allows a maximum of 5 days per trip.",
    });
  });
});
