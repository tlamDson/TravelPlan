import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";

vi.mock("../features/analytics/analytics-flag", () => ({
  isAnalyticsEnabled: vi.fn(() => false),
}));

import { isAnalyticsEnabled } from "../features/analytics/analytics-flag";
import { isJobStatusPoll, skipGeneralLimit } from "./rate-limit-skip";

function req(method: string, path: string): Request {
  return { method, path } as unknown as Request;
}

describe("isJobStatusPoll", () => {
  it("matches GET /api/jobs/:jobId", () => {
    expect(isJobStatusPoll(req("GET", "/api/jobs/123"))).toBe(true);
    expect(isJobStatusPoll(req("GET", "/api/jobs/abc-def/"))).toBe(true);
  });

  it("does not match job actions or other methods", () => {
    expect(isJobStatusPoll(req("POST", "/api/jobs/123/retry"))).toBe(false);
    expect(isJobStatusPoll(req("POST", "/api/jobs/123/cancel"))).toBe(false);
    expect(isJobStatusPoll(req("GET", "/api/jobs/123/retry"))).toBe(false);
    expect(isJobStatusPoll(req("DELETE", "/api/jobs/123"))).toBe(false);
    expect(isJobStatusPoll(req("GET", "/api/jobs"))).toBe(false);
    expect(isJobStatusPoll(req("GET", "/api/trips/123"))).toBe(false);
  });
});

describe("skipGeneralLimit", () => {
  beforeEach(() => {
    vi.mocked(isAnalyticsEnabled).mockReturnValue(false);
  });

  it("skips health probes", () => {
    expect(skipGeneralLimit(req("GET", "/health"))).toBe(true);
    expect(skipGeneralLimit(req("GET", "/ready"))).toBe(true);
  });

  it("skips job status polls — they have their own limiter", () => {
    expect(skipGeneralLimit(req("GET", "/api/jobs/123"))).toBe(true);
  });

  it("still meters normal actions, including job retry/cancel", () => {
    expect(skipGeneralLimit(req("GET", "/api/users/me"))).toBe(false);
    expect(skipGeneralLimit(req("DELETE", "/api/trips/1"))).toBe(false);
    expect(skipGeneralLimit(req("POST", "/api/jobs/1/retry"))).toBe(false);
  });

  it("skips /api/analytics/* only while analytics is enabled", () => {
    expect(skipGeneralLimit(req("POST", "/api/analytics/events"))).toBe(false);
    vi.mocked(isAnalyticsEnabled).mockReturnValue(true);
    expect(skipGeneralLimit(req("POST", "/api/analytics/events"))).toBe(true);
  });
});
