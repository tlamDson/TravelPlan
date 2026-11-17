import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";

vi.mock("../repositories/trip.repository", () => ({
  tripRepository: { findById: vi.fn(), update: vi.fn() },
}));
vi.mock("../../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { updateTripById } from "./trip-mutate.controller";
import { tripRepository } from "../repositories/trip.repository";

const VALID_ID = "507f1f77bcf86cd799439011";

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: any; json: any };
};

const makeReq = (body: unknown, tripId = VALID_ID) =>
  ({
    params: { tripId },
    body,
    auth: () => ({ userId: "user_1" }),
  }) as any;

describe("updateTripById input validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tripRepository.findById).mockResolvedValue({
      userId: "user_1",
    } as any);
    vi.mocked(tripRepository.update).mockResolvedValue({ ok: true } as any);
  });

  it("returns 400 for a non-ObjectId tripId without touching the repository", async () => {
    const res = makeRes();
    await updateTripById(makeReq({ title: "x" }, "not-an-id"), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(tripRepository.findById).not.toHaveBeenCalled();
  });

  it("returns 400 when title is not a string", async () => {
    const res = makeRes();
    await updateTripById(makeReq({ title: { a: 1 } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(tripRepository.update).not.toHaveBeenCalled();
  });

  it("returns 400 when description is not a string", async () => {
    const res = makeRes();
    await updateTripById(makeReq({ description: ["x"] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(tripRepository.update).not.toHaveBeenCalled();
  });

  it("returns 400 when title is blank after trimming", async () => {
    const res = makeRes();
    await updateTripById(makeReq({ title: "   " }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(tripRepository.update).not.toHaveBeenCalled();
  });

  it("returns 400 when title is longer than 200 characters", async () => {
    const res = makeRes();
    await updateTripById(makeReq({ title: "a".repeat(201) }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(tripRepository.update).not.toHaveBeenCalled();
  });

  it("returns 400 when description is longer than 2000 characters", async () => {
    const res = makeRes();
    await updateTripById(makeReq({ description: "a".repeat(2001) }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(tripRepository.update).not.toHaveBeenCalled();
  });

  it("trims and strips HTML before writing", async () => {
    const res = makeRes();
    await updateTripById(
      makeReq({
        title: "  Paris <script>alert(1)</script><b>trip</b>  ",
        description: "<img src=x onerror=alert(1)>Nice",
      }),
      res,
    );
    expect(tripRepository.update).toHaveBeenCalledWith(VALID_ID, {
      title: "Paris trip",
      description: "Nice",
    });
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it("returns 400 when title is only markup (empty after sanitising)", async () => {
    const res = makeRes();
    await updateTripById(makeReq({ title: "<script>x</script>" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(tripRepository.update).not.toHaveBeenCalled();
  });

  it("keeps plain-text punctuation as typed instead of storing HTML entities", async () => {
    const res = makeRes();
    await updateTripById(
      makeReq({
        title: `Tom & Jerry's "Big" Trip`,
        description: "5 < 6 & 7 > 3",
      }),
      res,
    );
    expect(tripRepository.update).toHaveBeenCalledWith(VALID_ID, {
      title: `Tom & Jerry's "Big" Trip`,
      description: "5 < 6 & 7 > 3",
    });
  });

  it("does not turn entity-encoded markup into live tags", async () => {
    const res = makeRes();
    await updateTripById(
      makeReq({ title: "Hi &lt;script&gt;alert(1)&lt;/script&gt;there" }),
      res,
    );
    expect(tripRepository.update).toHaveBeenCalledWith(VALID_ID, {
      title: "Hi there",
    });
  });
});
