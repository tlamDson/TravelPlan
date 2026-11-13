import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { ANALYTICS_BATCH_MAX_EVENTS } from "@travelplan/shared";

const mockIngest = vi.fn();
const mockSimIngest = vi.fn();
vi.mock("../services/analytics-ingest.service", () => ({
  ingestClientEvents: (...args: unknown[]) => mockIngest(...args),
  ingestSimulatedEvents: (...args: unknown[]) => mockSimIngest(...args),
}));

vi.mock("../../../lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  postAnalyticsEvents,
  postSimulatedAnalyticsEvents,
} from "./analytics.controller";

function makeReq(body: unknown, userId?: string | null): Request {
  if (userId === undefined) return { body } as Request;
  return { body, auth: () => ({ userId }) } as unknown as Request;
}

function makeRes() {
  const res = {} as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const okResult = { received: 2, accepted: 1, duplicates: 0, quarantined: 1 };

describe("postAnalyticsEvents", () => {
  beforeEach(() => {
    mockIngest.mockReset();
  });

  it("passes the raw events to the service and returns its counts", async () => {
    mockIngest.mockResolvedValue(okResult);
    const res = makeRes();
    await postAnalyticsEvents(makeReq({ events: [{ a: 1 }, 2] }), res);
    expect(mockIngest).toHaveBeenCalledWith([{ a: 1 }, 2], null);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(okResult);
  });

  it("passes the Clerk session's userId so events cannot claim another user", async () => {
    mockIngest.mockResolvedValue(okResult);
    await postAnalyticsEvents(makeReq({ events: [{}] }, "user_1"), makeRes());
    expect(mockIngest).toHaveBeenCalledWith([{}], "user_1");
  });

  it("treats a signed-out Clerk session as anonymous", async () => {
    mockIngest.mockResolvedValue(okResult);
    await postAnalyticsEvents(makeReq({ events: [{}] }, null), makeRes());
    expect(mockIngest).toHaveBeenCalledWith([{}], null);
  });

  it.each([
    ["a missing body", undefined],
    ["an object without events", {}],
    ["events that is not an array", { events: "x" }],
    ["an empty batch", { events: [] }],
    [
      "a batch over the size cap",
      {
        events: Array.from(
          { length: ANALYTICS_BATCH_MAX_EVENTS + 1 },
          () => ({}),
        ),
      },
    ],
  ])("400s on %s without calling the service", async (_label, body) => {
    const res = makeRes();
    await postAnalyticsEvents(makeReq(body), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it("500s when the service throws, so the client retries with the same ids", async () => {
    mockIngest.mockRejectedValue(new Error("mongo down"));
    const res = makeRes();
    await postAnalyticsEvents(makeReq({ events: [{}] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it("500s instead of sending counts that break the shared contract", async () => {
    mockIngest.mockResolvedValue({ ...okResult, accepted: 5 });
    const res = makeRes();
    await postAnalyticsEvents(makeReq({ events: [{}] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("postSimulatedAnalyticsEvents", () => {
  beforeEach(() => {
    mockIngest.mockReset();
    mockSimIngest.mockReset();
  });

  it("passes the raw events to the simulated channel, never the client one", async () => {
    mockSimIngest.mockResolvedValue(okResult);
    const res = makeRes();
    await postSimulatedAnalyticsEvents(
      makeReq({ events: [{ a: 1 }] }, "user_1"),
      res,
    );
    expect(mockSimIngest).toHaveBeenCalledWith([{ a: 1 }]);
    expect(mockIngest).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(okResult);
  });

  it("400s on a batch over the size cap without calling the service", async () => {
    const res = makeRes();
    const events = Array.from(
      { length: ANALYTICS_BATCH_MAX_EVENTS + 1 },
      () => ({}),
    );
    await postSimulatedAnalyticsEvents(makeReq({ events }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSimIngest).not.toHaveBeenCalled();
  });

  it("500s when the service throws, so the driver retries with the same ids", async () => {
    mockSimIngest.mockRejectedValue(new Error("mongo down"));
    const res = makeRes();
    await postSimulatedAnalyticsEvents(makeReq({ events: [{}] }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
