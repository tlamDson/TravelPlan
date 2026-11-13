import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

const mockGetAssignments = vi.fn();
const mockRecordExposure = vi.fn();
vi.mock("../services/experiments.service", () => ({
  getAssignments: (...a: unknown[]) => mockGetAssignments(...a),
  recordExposure: (...a: unknown[]) => mockRecordExposure(...a),
}));

const mockError = vi.fn();
vi.mock("../../../lib/logger", () => ({
  logger: {
    error: (...a: unknown[]) => mockError(...a),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  getExperimentAssignments,
  postExperimentExposure,
} from "./experiments.controller";

function makeReq(body: unknown, userId = "user_1"): Request {
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

describe("getExperimentAssignments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the session user's assignments", async () => {
    const assignments = [{ experimentKey: "vector-ab", variant: "control" }];
    mockGetAssignments.mockResolvedValue(assignments);
    const res = makeRes();
    await getExperimentAssignments(makeReq(undefined, "user_9"), res);
    expect(mockGetAssignments).toHaveBeenCalledWith("user_9");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ assignments });
  });

  it("500s and logs when the service fails", async () => {
    mockGetAssignments.mockRejectedValue(new Error("db down"));
    const res = makeRes();
    await getExperimentAssignments(makeReq(undefined), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockError).toHaveBeenCalled();
  });
});

describe("postExperimentExposure", () => {
  beforeEach(() => vi.clearAllMocks());

  const body = { experimentKey: "vector-ab", sessionId: "sess-1" };

  it("records the exposure for the session user and returns the result", async () => {
    const result = {
      experimentKey: "vector-ab",
      variant: "control",
      recorded: true,
    };
    mockRecordExposure.mockResolvedValue(result);
    const res = makeRes();
    await postExperimentExposure(makeReq(body, "user_2"), res);
    expect(mockRecordExposure).toHaveBeenCalledWith("user_2", body);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it("400s on an invalid body and never calls the service", async () => {
    for (const bad of [
      {},
      { experimentKey: "Bad Key", sessionId: "s" },
      { ...body, variant: "treatment" },
    ]) {
      const res = makeRes();
      await postExperimentExposure(makeReq(bad), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockRecordExposure).not.toHaveBeenCalled();
  });

  it("404s when the experiment is not running", async () => {
    mockRecordExposure.mockResolvedValue(null);
    const res = makeRes();
    await postExperimentExposure(makeReq(body), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("500s and logs when the service fails", async () => {
    mockRecordExposure.mockRejectedValue(new Error("quarantined"));
    const res = makeRes();
    await postExperimentExposure(makeReq(body), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockError).toHaveBeenCalled();
  });
});
