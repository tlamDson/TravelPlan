import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { ANALYTICS_BATCH_MAX_EVENTS } from "@travelplan/shared";

const mockIngest = vi.fn();
vi.mock("../services/analytics-ingest.service", () => ({
  ingestEvents: (...args: unknown[]) => mockIngest(...args),
}));

vi.mock("../../../lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { postAnalyticsEvents } from "./analytics.controller";

function makeReq(body: unknown): Request {
  return { body } as Request;
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
    expect(mockIngest).toHaveBeenCalledWith([{ a: 1 }, 2]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(okResult);
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
