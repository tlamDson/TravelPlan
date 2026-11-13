import type { Request } from "express";
import { isAnalyticsEnabled } from "../features/analytics/analytics-flag";

const JOB_STATUS_PATH = /^\/api\/jobs\/[^/]+\/?$/;

/**
 * GET /api/jobs/:jobId — the status poll the web client fires repeatedly
 * while a trip generates. Metered by jobStatusLimiter instead of the
 * general budget. Job actions (retry/cancel) are not polls.
 */
export function isJobStatusPoll(req: Request): boolean {
  return req.method === "GET" && JOB_STATUS_PATH.test(req.path);
}

/**
 * Requests generalLimiter does not count:
 * - /health, /ready: liveness/readiness probes (Railway, Docker healthcheck)
 *   hit these frequently and must never 429 real traffic.
 * - job status polls: own budget (jobStatusLimiter), so one generation's
 *   polling never starves normal actions.
 * - /api/analytics/*: own budget (analyticsLimiter) while mounted; when the
 *   flag is off the 404s stay metered here.
 */
export function skipGeneralLimit(req: Request): boolean {
  return (
    req.path === "/health" ||
    req.path === "/ready" ||
    isJobStatusPoll(req) ||
    (req.path.startsWith("/api/analytics/") && isAnalyticsEnabled())
  );
}
