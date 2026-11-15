import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked directly rather than flipped via process.env — CI proved that
// approach unreliable: process.env.ENABLE_RELIABILITY_API set at the top
// of this file did NOT take effect, because config/env.ts's cleanEnv()
// had already run (and its module output was already cached) from an
// earlier integration test file importing app.ts within the same Vitest
// worker — module isolation is per-file for the test's own module graph,
// but the already-evaluated `env` object is not re-computed just because
// process.env changed afterward. Mocking the flag function directly
// sidesteps this entirely: it's hoisted and applies to every import
// resolved from this file, independent of any other file's env timing.
vi.mock("../../features/reliability/reliability-flag", () => ({
  isReliabilityApiEnabled: () => true,
}));

// Bypasses the Clerk-email lookup entirely (assertReliabilityAdminAccess
// would otherwise call getClerkUserPrimaryEmail, a REAL network call to
// Clerk's REST API that the @clerk/express session stub doesn't
// intercept) — full control per test case, no external dependency.
const mockAssertAccess = vi.fn();
vi.mock(
  "../../features/reliability/services/reliability-admin-guard.service",
  () => ({
    assertReliabilityAdminAccess: (...args: unknown[]) =>
      mockAssertAccess(...args),
  }),
);

import request from "supertest";
import { createApp } from "../../app";
import { asUser } from "../integration-fixtures";
import JobMetric from "../../features/reliability/models/JobMetric";

const app = createApp();

function makeDoc(jobId: string, outcome: string, finishedAt: Date) {
  return {
    queue: "trip-generation",
    jobName: "generate-trip",
    jobId,
    outcome,
    attemptsMade: 1,
    queueWaitMs: 100,
    processingMs: 200,
    endToEndMs: 300,
    finishedAt,
  };
}

describe("GET /api/reliability/slo — access control (flag mocked on)", () => {
  beforeEach(() => {
    mockAssertAccess.mockReset();
  });

  it("401s an unauthenticated request — the guard is never even called", async () => {
    const res = await request(app).get("/api/reliability/slo");
    expect(res.status).toBe(401);
    expect(mockAssertAccess).not.toHaveBeenCalled();
  });

  it("403s an authenticated user the admin guard rejects", async () => {
    mockAssertAccess.mockResolvedValue({ ok: false, reason: "not_admin" });
    const res = await request(app)
      .get("/api/reliability/slo")
      .set(asUser("user-stranger"));
    expect(res.status).toBe(403);
  });

  it("400s an invalid windowDays query param", async () => {
    mockAssertAccess.mockResolvedValue({
      ok: true,
      email: "admin@example.com",
    });
    const res = await request(app)
      .get("/api/reliability/slo?windowDays=abc")
      .set(asUser("user-admin"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/reliability/slo — report content for an allowlisted admin", () => {
  beforeEach(() => {
    mockAssertAccess.mockResolvedValue({
      ok: true,
      email: "admin@example.com",
    });
  });

  it("returns 200 with insufficientData:true and no NaN when there is no recorded data", async () => {
    const res = await request(app)
      .get("/api/reliability/slo")
      .set(asUser("user-admin"));

    expect(res.status).toBe(200);
    expect(res.body.windows.compliance.sli.insufficientData).toBe(true);
    expect(res.body.windows.compliance.sli.sli).toBeNull();
    expect(
      Number.isNaN(res.body.windows.compliance.errorBudget.consumedRatio),
    ).toBe(false);
  });

  it("proves the honest FALLBACK definition survives the full stack — 90 completed / 5 fallback / 5 failed real documents yields sli≈0.9, consumedRatio≈1.0", async () => {
    const now = new Date();
    const docs = [
      ...Array.from({ length: 90 }, (_, i) =>
        makeDoc(`c-${i}`, "completed", now),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeDoc(`f-${i}`, "fallback", now),
      ),
      ...Array.from({ length: 5 }, (_, i) => makeDoc(`x-${i}`, "failed", now)),
    ];
    await JobMetric.insertMany(docs);

    const res = await request(app)
      .get("/api/reliability/slo")
      .set(asUser("user-admin"));

    expect(res.status).toBe(200);
    // toBeCloseTo, not toBe — validEvents * (1 - target) is a float
    // artifact (see Phase 3's slo-math.test.ts for the same lesson).
    expect(res.body.windows.compliance.sli.sli).toBeCloseTo(0.9);
    expect(res.body.windows.compliance.errorBudget.consumedRatio).toBeCloseTo(
      1.0,
    );
    expect(res.body.signals.errors.fallbackRate).toBeCloseTo(0.05);
    expect(res.body.signals.errors.failureRate).toBeCloseTo(0.05);
  });
});
