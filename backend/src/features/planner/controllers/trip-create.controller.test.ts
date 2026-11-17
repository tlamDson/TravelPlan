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
vi.mock("../schemas/trip-request.schema", () => ({
  TripPreferencesSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
}));
vi.mock("../../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { generateTrip } from "./trip-create.controller";
import { plannerService } from "../services/planner.service";
import { userQuotaService } from "../services/user-quota.service";
import { idempotencyRepository } from "../../user/repositories/idempotency.repository";
import { TripRequestRejectedError } from "../services/trip-request-rejected.error";

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: any; json: any };
};

const makeReq = (key?: string) =>
  ({
    headers: key ? { "x-idempotency-key": key } : {},
    body: { preferences: { destination: "Hanoi" } },
    auth: () => ({ userId: "user-1" }),
  }) as any;

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
    await generateTrip(makeReq("k1"), res);

    expect(order).toEqual(["reserve", "enqueue"]);
    expect(idempotencyRepository.reserve).toHaveBeenCalledWith("user-1", "k1");
    expect(idempotencyRepository.complete).toHaveBeenCalledWith(
      "user-1",
      "k1",
      { tripId: "t1", jobId: "j1" },
    );
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("returns the stored result and does not enqueue when the key is already taken", async () => {
    vi.mocked(idempotencyRepository.reserve).mockResolvedValue({
      status: "duplicate",
      tripId: "t0",
      jobId: "j0",
    });
    const res = makeRes();
    await generateTrip(makeReq("k1"), res);

    expect(plannerService.createTripGenerationJob).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "t0", jobId: "j0", idempotent: true }),
    );
  });

  it("answers 409 and does not enqueue while the first request is still in flight", async () => {
    vi.mocked(idempotencyRepository.reserve).mockResolvedValue({
      status: "duplicate",
    });
    const res = makeRes();
    await generateTrip(makeReq("k1"), res);

    expect(plannerService.createTripGenerationJob).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ idempotent: true }),
    );
  });

  it("releases the reservation when the request is rejected before any write, so a retry can proceed", async () => {
    vi.mocked(idempotencyRepository.reserve).mockResolvedValue({
      status: "reserved",
    });
    vi.mocked(plannerService.createTripGenerationJob).mockRejectedValue(
      new TripRequestRejectedError("Trip too long"),
    );
    const res = makeRes();
    await generateTrip(makeReq("k1"), res);

    expect(idempotencyRepository.release).toHaveBeenCalledWith("user-1", "k1");
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
    await generateTrip(makeReq("k1"), res);

    expect(idempotencyRepository.release).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("still answers 202 when storing the result fails after the job was accepted", async () => {
    vi.mocked(idempotencyRepository.reserve).mockResolvedValue({
      status: "reserved",
    });
    vi.mocked(idempotencyRepository.complete).mockRejectedValue(
      new Error("Mongo down"),
    );
    const res = makeRes();
    await generateTrip(makeReq("k1"), res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "t1", jobId: "j1" }),
    );
  });

  it("does not touch the idempotency log without a header", async () => {
    const res = makeRes();
    await generateTrip(makeReq(), res);

    expect(idempotencyRepository.reserve).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(202);
  });
});
