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
vi.mock("../../user/repositories/idempotency.repository", () => ({
  idempotencyRepository: {
    reserve: vi.fn(),
    complete: vi.fn(),
    release: vi.fn(),
  },
}));
vi.mock("../../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { generateTrip } from "./trip-create.controller";
import { plannerService } from "../services/planner.service";
import { userQuotaService } from "../services/user-quota.service";
import { userRepository } from "../../user/repositories/user.repository";
import { logger } from "../../../lib/logger";
import { idempotencyRepository } from "../../user/repositories/idempotency.repository";
import { TripRequestError } from "../errors";

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
  res.set = vi.fn().mockReturnValue(res);
  return res as Response & { status: any; json: any };
};

const makeReq = (body: unknown, key?: string) =>
  ({
    body,
    headers: key ? { "x-idempotency-key": key } : {},
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
    const payload = vi.mocked(logger.warn).mock.calls[0]![0] as any;
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

describe("generateTrip idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userQuotaService.canCreateTrip).mockResolvedValue({
      allowed: true,
      remaining: 5,
      limit: 10,
      resetAt: new Date("2026-12-01"),
    } as any);
    vi.mocked(plannerService.createTripGenerationJob).mockResolvedValue({
      tripId: "t1",
      jobId: "j1",
    } as any);
    vi.mocked(userRepository.findByClerkId).mockResolvedValue({
      tier: "free",
    } as any);
  });

  it("reserves the key before enqueueing, then stores the result", async () => {
    const order: string[] = [];
    vi.mocked(idempotencyRepository.reserve).mockImplementation(async () => {
      order.push("reserve");
      return { status: "reserved" };
    });
    vi.mocked(plannerService.createTripGenerationJob).mockImplementation(
      async () => {
        order.push("enqueue");
        return { tripId: "t1", jobId: "j1" } as any;
      },
    );
    const res = makeRes();
    await generateTrip(makeReq({ preferences: validPreferences }, "k1"), res);

    expect(order).toEqual(["reserve", "enqueue"]);
    expect(idempotencyRepository.reserve).toHaveBeenCalledWith("user_1", "k1");
    expect(idempotencyRepository.complete).toHaveBeenCalledWith(
      "user_1",
      "k1",
      { tripId: "t1", jobId: "j1" },
    );
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("returns the stored result and does not enqueue when the key is already taken", async () => {
    vi.mocked(idempotencyRepository.reserve).mockResolvedValue({
      status: "completed",
      tripId: "t0",
      jobId: "j0",
    });
    const res = makeRes();
    await generateTrip(makeReq({ preferences: validPreferences }, "k1"), res);

    expect(plannerService.createTripGenerationJob).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "t0", jobId: "j0", idempotent: true }),
    );
  });

  it("answers 409 with retry-later-same-key guidance while the first request is in flight", async () => {
    vi.mocked(idempotencyRepository.reserve).mockResolvedValue({
      status: "pending",
    });
    const res = makeRes();
    await generateTrip(makeReq({ preferences: validPreferences }, "k1"), res);

    expect(plannerService.createTripGenerationJob).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.set).toHaveBeenCalledWith("Retry-After", "2");
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ success: false, idempotent: true });
    // A new key while the first request is still enqueueing would create a
    // second trip, so the guidance must be to reuse the same key.
    expect(body.message).toMatch(/same key/i);
    expect(body.message).not.toMatch(/new key/i);
  });

  it("answers 409 without a retry instruction when an earlier same-key request failed partway", async () => {
    vi.mocked(idempotencyRepository.reserve).mockResolvedValue({
      status: "abandoned",
    });
    const res = makeRes();
    await generateTrip(makeReq({ preferences: validPreferences }, "k1"), res);

    expect(plannerService.createTripGenerationJob).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.set).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ success: false, idempotent: true });
    expect(body.message).toMatch(/check your trips/i);
    expect(body.message).not.toMatch(/new key|retry/i);
  });

  it("looks up the user before reserving, so a lookup failure leaves no reservation behind", async () => {
    vi.mocked(userRepository.findByClerkId).mockRejectedValue(
      new Error("Mongo down"),
    );
    const res = makeRes();
    await generateTrip(makeReq({ preferences: validPreferences }, "k1"), res);

    expect(idempotencyRepository.reserve).not.toHaveBeenCalled();
    expect(plannerService.createTripGenerationJob).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("passes the looked-up tier to the service, so it does no user I/O after the reservation", async () => {
    vi.mocked(userRepository.findByClerkId).mockResolvedValue({
      tier: "pro",
    } as any);
    vi.mocked(idempotencyRepository.reserve).mockResolvedValue({
      status: "reserved",
    });
    const res = makeRes();
    await generateTrip(makeReq({ preferences: validPreferences }, "k1"), res);

    expect(plannerService.createTripGenerationJob).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", userTier: "pro" }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "pro" }),
    );
  });

  it("releases the reservation when the request is rejected before any write, so a retry can proceed", async () => {
    vi.mocked(idempotencyRepository.reserve).mockResolvedValue({
      status: "reserved",
    });
    vi.mocked(plannerService.createTripGenerationJob).mockRejectedValue(
      new TripRequestError("Trip too long"),
    );
    const res = makeRes();
    await generateTrip(makeReq({ preferences: validPreferences }, "k1"), res);

    expect(idempotencyRepository.release).toHaveBeenCalledWith("user_1", "k1");
    expect(idempotencyRepository.complete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("keeps the reservation when enqueueing fails partway, so a same-key retry cannot create a second trip or job", async () => {
    vi.mocked(idempotencyRepository.reserve).mockResolvedValue({
      status: "reserved",
    });
    vi.mocked(plannerService.createTripGenerationJob).mockRejectedValue(
      new Error("Redis connection lost"),
    );
    const res = makeRes();
    await generateTrip(makeReq({ preferences: validPreferences }, "k1"), res);

    expect(idempotencyRepository.release).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("still answers 202 when storing the result fails after the job was accepted", async () => {
    vi.mocked(idempotencyRepository.reserve).mockResolvedValue({
      status: "reserved",
    });
    vi.mocked(idempotencyRepository.complete).mockRejectedValue(
      new Error("Mongo down"),
    );
    const res = makeRes();
    await generateTrip(makeReq({ preferences: validPreferences }, "k1"), res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "t1", jobId: "j1" }),
    );
  });

  it("does not touch the idempotency log without a header", async () => {
    const res = makeRes();
    await generateTrip(makeReq({ preferences: validPreferences }), res);

    expect(idempotencyRepository.reserve).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(202);
  });
});
