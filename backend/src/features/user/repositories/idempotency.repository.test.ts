import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
const findOneMock = vi.fn();
const updateOneMock = vi.fn();
const deleteOneMock = vi.fn();
const indexesMock = vi.fn();
const dropIndexMock = vi.fn();
const createIndexesMock = vi.fn();

vi.mock("../models/IdempotencyLog", () => ({
  default: {
    collection: {
      indexes: (...a: unknown[]) => indexesMock(...a),
      dropIndex: (...a: unknown[]) => dropIndexMock(...a),
    },
    createIndexes: (...a: unknown[]) => createIndexesMock(...a),
    create: (...a: unknown[]) => createMock(...a),
    findOne: (...a: unknown[]) => findOneMock(...a),
    updateOne: (...a: unknown[]) => updateOneMock(...a),
    deleteOne: (...a: unknown[]) => deleteOneMock(...a),
  },
}));

import {
  idempotencyRepository,
  IdempotencyRepository,
} from "./idempotency.repository";

const lean = (value: unknown) => ({
  lean: () => ({ exec: vi.fn().mockResolvedValue(value) }),
});
const dupError = () => Object.assign(new Error("dup"), { code: 11000 });

beforeEach(() => {
  vi.clearAllMocks();
  indexesMock.mockResolvedValue([{ name: "_id_" }]);
  createIndexesMock.mockResolvedValue(undefined);
  dropIndexMock.mockResolvedValue(undefined);
});

describe("idempotencyRepository index migration", () => {
  it("drops the legacy global unique key_1 index, then builds the schema indexes, once", async () => {
    indexesMock.mockResolvedValue([
      { name: "_id_" },
      { name: "key_1", unique: true },
    ]);
    createMock.mockResolvedValue({});
    const repo = new IdempotencyRepository();
    await repo.reserve("user-1", "k1");
    await repo.reserve("user-1", "k2");

    expect(dropIndexMock).toHaveBeenCalledTimes(1);
    expect(dropIndexMock).toHaveBeenCalledWith("key_1");
    expect(createIndexesMock).toHaveBeenCalledTimes(1);
    expect(dropIndexMock.mock.invocationCallOrder[0]).toBeLessThan(
      createIndexesMock.mock.invocationCallOrder[0]!,
    );
  });

  it("does not drop anything when the legacy index is absent", async () => {
    createMock.mockResolvedValue({});
    await new IdempotencyRepository().reserve("user-1", "k1");
    expect(dropIndexMock).not.toHaveBeenCalled();
    expect(createIndexesMock).toHaveBeenCalledTimes(1);
  });

  it("treats a missing collection (fresh DB) as nothing to migrate", async () => {
    indexesMock.mockRejectedValue(
      Object.assign(new Error("ns does not exist"), { code: 26 }),
    );
    createMock.mockResolvedValue({});
    const r = await new IdempotencyRepository().reserve("user-1", "k1");
    expect(r).toEqual({ status: "reserved" });
    expect(createIndexesMock).toHaveBeenCalledTimes(1);
  });

  it("retries the migration on the next call when it failed", async () => {
    createIndexesMock.mockRejectedValueOnce(new Error("Mongo down"));
    createMock.mockResolvedValue({});
    const repo = new IdempotencyRepository();
    await expect(repo.reserve("user-1", "k1")).rejects.toThrow("Mongo down");
    await expect(repo.reserve("user-1", "k1")).resolves.toEqual({
      status: "reserved",
    });
    expect(createIndexesMock).toHaveBeenCalledTimes(2);
  });
});

describe("idempotencyRepository.reserve", () => {
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
    await expect(idempotencyRepository.reserve("user-1", "k1")).rejects.toThrow(
      "Mongo down",
    );
  });
});

describe("idempotencyRepository.complete / release", () => {
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
