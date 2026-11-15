import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAssertAccess = vi.fn();
vi.mock("../services/reliability-admin-guard.service", () => ({
  assertReliabilityAdminAccess: (...args: unknown[]) =>
    mockAssertAccess(...args),
}));

const mockBuildSloReport = vi.fn();
vi.mock("../services/slo-report.service", () => ({
  buildSloReport: (...args: unknown[]) => mockBuildSloReport(...args),
}));

import { getSloReport } from "./reliability.controller";
import type { Response } from "express";
import type { ClerkRequest } from "../../../types/express";

function makeReq(overrides: Partial<ClerkRequest> = {}): ClerkRequest {
  return {
    auth: () => ({ userId: "user-1" }),
    query: {},
    ...overrides,
  } as ClerkRequest;
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

const validReport = {
  success: true,
  generatedAt: "2026-08-24T00:00:00.000Z",
  windows: {
    compliance: {
      sli: {
        validEvents: 100,
        goodEvents: 90,
        badEvents: 10,
        sli: 0.9,
        insufficientData: false,
      },
      errorBudget: {
        target: 0.9,
        budgetTotal: 10,
        budgetConsumed: 10,
        budgetRemaining: 0,
        consumedRatio: 1,
        burnRate: 1,
        exhaustsAt: null,
      },
    },
    fastBurn: {
      sli: {
        validEvents: 10,
        goodEvents: 9,
        badEvents: 1,
        sli: 0.9,
        insufficientData: false,
      },
      errorBudget: {
        target: 0.9,
        budgetTotal: 1,
        budgetConsumed: 1,
        budgetRemaining: 0,
        consumedRatio: 1,
        burnRate: 1,
        exhaustsAt: null,
      },
    },
    slowBurn: {
      sli: {
        validEvents: 20,
        goodEvents: 18,
        badEvents: 2,
        sli: 0.9,
        insufficientData: false,
      },
      errorBudget: {
        target: 0.9,
        budgetTotal: 2,
        budgetConsumed: 2,
        budgetRemaining: 0,
        consumedRatio: 1,
        burnRate: 1,
        exhaustsAt: null,
      },
    },
  },
  signals: {
    latency: {
      queueWaitMs: { count: 0, p50: 0, p95: 0, p99: 0, max: 0 },
      processingMs: { count: 0, p50: 0, p95: 0, p99: 0, max: 0 },
      endToEndMs: { count: 0, p50: 0, p95: 0, p99: 0, max: 0 },
    },
    traffic: { totalJobs: 100, jobsPerHour: 0.15 },
    errors: {
      sli: {
        validEvents: 100,
        goodEvents: 90,
        badEvents: 10,
        sli: 0.9,
        insufficientData: false,
      },
      fallbackRate: 0.05,
      failureRate: 0.05,
    },
    saturation: {
      queues: [],
      workerAlive: true,
      lastHeartbeatAt: null,
      stalledCount: 0,
    },
  },
};

describe("getSloReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responds 401 when there's no authenticated user", async () => {
    const req = makeReq({ auth: () => ({}) });
    const res = makeRes();

    await getSloReport(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockAssertAccess).not.toHaveBeenCalled();
  });

  it("responds 403 for a user not on the SRE admin allowlist, and never calls the service", async () => {
    mockAssertAccess.mockResolvedValue({ ok: false, reason: "not_admin" });
    const req = makeReq();
    const res = makeRes();

    await getSloReport(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockBuildSloReport).not.toHaveBeenCalled();
  });

  it("responds 400 for an invalid windowDays query param", async () => {
    mockAssertAccess.mockResolvedValue({ ok: true, email: "you@example.com" });
    const req = makeReq({ query: { windowDays: "abc" } });
    const res = makeRes();

    await getSloReport(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockBuildSloReport).not.toHaveBeenCalled();
  });

  it("responds 500 (not a malformed 200) when the service's payload fails response validation", async () => {
    mockAssertAccess.mockResolvedValue({ ok: true, email: "you@example.com" });
    mockBuildSloReport.mockResolvedValue({ success: true }); // missing windows/signals/etc.
    const req = makeReq();
    const res = makeRes();

    await getSloReport(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("responds 200 with the validated report for an allowlisted admin", async () => {
    mockAssertAccess.mockResolvedValue({ ok: true, email: "you@example.com" });
    mockBuildSloReport.mockResolvedValue(validReport);
    const req = makeReq();
    const res = makeRes();

    await getSloReport(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });
});
