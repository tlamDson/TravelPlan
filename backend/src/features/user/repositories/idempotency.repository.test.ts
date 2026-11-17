import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
const findOneMock = vi.fn();
const updateOneMock = vi.fn();
const deleteOneMock = vi.fn();

vi.mock("../models/IdempotencyLog", () => ({
  default: {
    init: vi.fn().mockResolvedValue(undefined),
    create: (...a: unknown[]) => createMock(...a),
    findOne: (...a: unknown[]) => findOneMock(...a),
    updateOne: (...a: unknown[]) => updateOneMock(...a),
    deleteOne: (...a: unknown[]) => deleteOneMock(...a),
  },
}));

import { idempotencyRepository } from "./idempotency.repository";

const lean = (value: unknown) => ({
  lean: () => ({ exec: vi.fn().mockResolvedValue(value) }),
});
const dupError = () => Object.assign(new Error("dup"), { code: 11000 });

describe("idempotencyRepository.reserve", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a pending log and reports reserved", async () => {
    createMock.mockResolvedValue({});
    const r = await idempotencyRepository.reserve("user-1", "k1");
    expect(r).toEqual({ status: "reserved" });
    expect(createMock).toHaveBeenCalledWith({ key: "k1", userId: "user-1" });
  });

  it("returns the stored result on a duplicate-key error", async () => {
    createMock.mockRejectedValue(dupError());
    findOneMock.mockReturnValue(lean({ tripId: "t1", jobId: "j1" }));
    const r = await idempotencyRepository.reserve("user-1", "k1");
    expect(r).toEqual({ status: "duplicate", tripId: "t1", jobId: "j1" });
    expect(findOneMock).toHaveBeenCalledWith({ key: "k1", userId: "user-1" });
  });

  it("reports a pending duplicate when the first request has not finished", async () => {
    createMock.mockRejectedValue(dupError());
    findOneMock.mockReturnValue(lean({}));
    const r = await idempotencyRepository.reserve("user-1", "k1");
    expect(r).toEqual({
      status: "duplicate",
      tripId: undefined,
      jobId: undefined,
    });
  });

  it("rethrows errors that are not duplicate-key errors", async () => {
    createMock.mockRejectedValue(new Error("Mongo down"));
    await expect(
      idempotencyRepository.reserve("user-1", "k1"),
    ).rejects.toThrow("Mongo down");
  });
});

describe("idempotencyRepository.complete / release", () => {
  beforeEach(() => vi.clearAllMocks());

  it("complete stores tripId/jobId on the (userId, key) log", async () => {
    updateOneMock.mockReturnValue({ exec: vi.fn().mockResolvedValue({}) });
    await idempotencyRepository.complete("user-1", "k1", {
      tripId: "t1",
      jobId: "j1",
    });
    expect(updateOneMock).toHaveBeenCalledWith(
      { key: "k1", userId: "user-1" },
      { $set: { tripId: "t1", jobId: "j1" } },
    );
  });

  it("release deletes only a still-pending log", async () => {
    deleteOneMock.mockReturnValue({ exec: vi.fn().mockResolvedValue({}) });
    await idempotencyRepository.release("user-1", "k1");
    expect(deleteOneMock).toHaveBeenCalledWith({
      key: "k1",
      userId: "user-1",
      tripId: { $exists: false },
    });
  });
});
