import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";

const findOneMock = vi.fn();

vi.mock("../features/user/models/IdempotencyLog", () => ({
  default: { findOne: (...args: unknown[]) => findOneMock(...args) },
}));

import { idempotencyMiddleware } from "./idempotency.middleware";

function fakeReq(opts: { key?: string; userId?: string }) {
  return {
    headers: opts.key ? { "x-idempotency-key": opts.key } : {},
    auth: opts.userId ? () => ({ userId: opts.userId }) : undefined,
  } as any;
}

function fakeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe("idempotencyMiddleware", () => {
  beforeEach(() => {
    findOneMock.mockReset();
  });

  it("calls next() without a header, without touching the DB", async () => {
    const next = vi.fn();
    await idempotencyMiddleware(fakeReq({}), fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it("calls next() when there is a header but no authenticated user", async () => {
    const next = vi.fn();
    await idempotencyMiddleware(fakeReq({ key: "k1" }), fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it("short-circuits with a cached 200 for a matching (key, userId), without calling next()", async () => {
    findOneMock.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ tripId: "trip-1", jobId: "job-1" }),
    });
    const next = vi.fn();
    const res = fakeRes();
    await idempotencyMiddleware(
      fakeReq({ key: "k1", userId: "user-1" }),
      res,
      next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: "trip-1",
        jobId: "job-1",
        idempotent: true,
      }),
    );
    expect(findOneMock).toHaveBeenCalledWith({ key: "k1", userId: "user-1" });
  });

  it("answers 409 while the reservation is still pending, without calling next()", async () => {
    findOneMock.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ status: "pending" }),
    });
    const next = vi.fn();
    const res = fakeRes();
    await idempotencyMiddleware(
      fakeReq({ key: "k1", userId: "user-1" }),
      res,
      next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("does not leak a cached result across different userIds for the same key", async () => {
    findOneMock.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    const next = vi.fn();
    await idempotencyMiddleware(
      fakeReq({ key: "k1", userId: "user-2" }),
      fakeRes(),
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(findOneMock).toHaveBeenCalledWith({ key: "k1", userId: "user-2" });
  });

  it("fails open (calls next()) when the DB lookup throws", async () => {
    findOneMock.mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error("Mongo down")),
    });
    const next = vi.fn();
    const res = fakeRes();
    await idempotencyMiddleware(
      fakeReq({ key: "k1", userId: "user-1" }),
      res,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
