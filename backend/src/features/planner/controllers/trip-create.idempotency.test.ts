import { describe, it, expect, vi, beforeEach } from "vitest";

type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();

// In-memory stand-in for the IdempotencyLog model. `create` enforces the
// unique `key` index atomically, like MongoDB (E11000, code 11000).
vi.mock("../../user/models/IdempotencyLog", () => {
  const query = (doc: Doc | null) => ({
    lean: () => ({ exec: async () => doc }),
    exec: async () => doc,
  });
  return {
    default: {
      create: vi.fn(async (doc: Doc) => {
        if (store.has(doc.key as string)) {
          throw Object.assign(new Error("E11000 duplicate key"), {
            code: 11000,
          });
        }
        store.set(doc.key as string, { ...doc });
        return doc;
      }),
      findOne: vi.fn((filter: Doc) => {
        const doc = store.get(filter.key as string);
        return query(doc && doc.userId === filter.userId ? { ...doc } : null);
      }),
      updateOne: vi.fn(async (filter: Doc, update: { $set: Doc }) => {
        const doc = store.get(filter.key as string);
        if (doc) Object.assign(doc, update.$set);
        return { modifiedCount: doc ? 1 : 0 };
      }),
      deleteOne: vi.fn(async (filter: Doc) => {
        const doc = store.get(filter.key as string);
        if (doc && (!filter.status || doc.status === filter.status)) {
          store.delete(filter.key as string);
        }
        return { deletedCount: 1 };
      }),
    },
  };
});
vi.mock("../services/planner.service", () => ({
  plannerService: { createTripGenerationJob: vi.fn() },
}));
vi.mock("../services/user-quota.service", () => ({
  userQuotaService: { canCreateTrip: vi.fn() },
}));
vi.mock("../../user/repositories/user.repository", () => ({
  userRepository: { findByClerkId: vi.fn() },
}));
vi.mock("../../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { generateTrip } from "./trip-create.controller";
import { JobEnqueuedError } from "../errors";
import { plannerService } from "../services/planner.service";
import { userQuotaService } from "../services/user-quota.service";
import { userRepository } from "../../user/repositories/user.repository";

const KEY = "11111111-1111-4111-8111-111111111111";

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
  return res;
};

const makeReq = (key: string | undefined = KEY) =>
  ({
    body: { preferences: validPreferences },
    headers: key ? { "x-idempotency-key": key } : {},
    auth: () => ({ userId: "user_1" }),
  }) as any;

describe("generateTrip idempotency reservation", () => {
  beforeEach(() => {
    store.clear();
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

  it("enqueues once when two concurrent requests share an idempotency key", async () => {
    vi.mocked(plannerService.createTripGenerationJob).mockImplementation(
      async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { tripId: "trip-1", jobId: "job-1" } as any;
      },
    );
    const resA = makeRes();
    const resB = makeRes();

    await Promise.all([
      generateTrip(makeReq(), resA),
      generateTrip(makeReq(), resB),
    ]);

    expect(plannerService.createTripGenerationJob).toHaveBeenCalledTimes(1);
    const statuses = [resA, resB].map((r) => r.status.mock.calls[0][0]).sort();
    expect(statuses).toEqual([202, 409]);
  });

  it("reserves the key before it enqueues the job", async () => {
    let seenAtEnqueue: Doc | undefined;
    vi.mocked(plannerService.createTripGenerationJob).mockImplementation(
      async () => {
        seenAtEnqueue = store.get(KEY) && { ...store.get(KEY)! };
        return { tripId: "trip-1", jobId: "job-1" } as any;
      },
    );

    await generateTrip(makeReq(), makeRes());

    expect(seenAtEnqueue).toMatchObject({ key: KEY, status: "pending" });
  });

  it("stores tripId and jobId on the reservation once the job is enqueued", async () => {
    vi.mocked(plannerService.createTripGenerationJob).mockResolvedValue({
      tripId: "trip-1",
      jobId: "job-1",
    } as any);

    await generateTrip(makeReq(), makeRes());

    expect(store.get(KEY)).toMatchObject({
      tripId: "trip-1",
      jobId: "job-1",
      status: "completed",
    });
  });

  it("returns the stored response for a duplicate of a finished request, without a second job", async () => {
    store.set(KEY, {
      key: KEY,
      userId: "user_1",
      tripId: "trip-1",
      jobId: "job-1",
    });
    const res = makeRes();

    await generateTrip(makeReq(), res);

    expect(plannerService.createTripGenerationJob).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      tripId: "trip-1",
      jobId: "job-1",
      idempotent: true,
    });
  });

  it("releases the reservation when enqueueing fails so a retry can enqueue", async () => {
    vi.mocked(plannerService.createTripGenerationJob)
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:6379"))
      .mockResolvedValueOnce({ tripId: "trip-2", jobId: "job-2" } as any);
    const failed = makeRes();
    await generateTrip(makeReq(), failed);
    expect(failed.status).toHaveBeenCalledWith(500);
    expect(store.has(KEY)).toBe(false);

    const retry = makeRes();
    await generateTrip(makeReq(), retry);

    expect(retry.status).toHaveBeenCalledWith(202);
    expect(plannerService.createTripGenerationJob).toHaveBeenCalledTimes(2);
  });

  it("does not touch the log when there is no idempotency header", async () => {
    vi.mocked(plannerService.createTripGenerationJob).mockResolvedValue({
      tripId: "trip-1",
      jobId: "job-1",
    } as any);

    await generateTrip(makeReq(""), makeRes());

    expect(store.size).toBe(0);
    expect(plannerService.createTripGenerationJob).toHaveBeenCalledTimes(1);
  });

  it("does not enqueue when the duplicate lookup fails", async () => {
    store.set(KEY, { key: KEY, userId: "user_1", status: "pending" });
    const IdempotencyLog = (await import("../../user/models/IdempotencyLog"))
      .default as any;
    IdempotencyLog.findOne.mockImplementationOnce(() => {
      throw new Error("mongo unavailable");
    });
    const res = makeRes();

    await generateTrip(makeReq(), res);

    expect(plannerService.createTripGenerationJob).not.toHaveBeenCalled();
    expect(res.status.mock.calls[0][0]).toBeGreaterThanOrEqual(409);
  });

  it("keeps the reservation, completed with the ids, when a failure follows the enqueue", async () => {
    vi.mocked(plannerService.createTripGenerationJob).mockRejectedValue(
      new JobEnqueuedError("lock write failed", {
        tripId: "trip-1",
        jobId: "job-1",
      }),
    );
    const res = makeRes();

    await generateTrip(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(store.get(KEY)).toMatchObject({
      tripId: "trip-1",
      jobId: "job-1",
      status: "completed",
    });
    const retry = makeRes();
    await generateTrip(makeReq(), retry);
    expect(plannerService.createTripGenerationJob).toHaveBeenCalledTimes(1);
    expect(retry.status).toHaveBeenCalledWith(200);
  });
});
