import { env } from "../../config/env";

/**
 * Dev-only admin endpoints (`/api/dev/toggle-pro`, `/api/dev/scrape-insights`)
 * and the Bull Board queue inspector (`/admin/queues`) are mounted only
 * in local development — never reachable in test, staging, or
 * production, even before each `/api/dev` controller's own
 * `env.NODE_ENV !== "development"` guard runs (Bull Board has no such
 * second guard — see bull-board.ts). Mirrors `isCalendarSyncEnabled()` in
 * features/calendar/calendar-feature-flag.ts.
 */
export function isDevRoutesEnabled(): boolean {
  return env.NODE_ENV === "development";
}
