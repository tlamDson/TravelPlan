import { env } from "../../config/env";

/**
 * POST /api/analytics/sim/events (the simkit load driver, B2 plan PR 16)
 * is mounted only when ANALYTICS_SIM_INGEST is exactly "true", on top of
 * ANALYTICS_ENABLED. Off everywhere by default.
 */
export function isSimIngestEnabled(): boolean {
  return env.ANALYTICS_SIM_INGEST === "true";
}

/**
 * The sim route takes server-sourced events and simulated userIds from an
 * unauthenticated, unmetered caller, so it must never run in a deployed
 * environment. Staging runs NODE_ENV=production too (APP_ENV=staging), so
 * this one check covers both. Called at mount time: boot fails instead.
 */
export function assertSimIngestAllowed(): void {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "ANALYTICS_SIM_INGEST=true is for a local load test only; refusing to mount it with NODE_ENV=production",
    );
  }
}
