import { env } from "../../config/env";

/**
 * `/api/analytics/*` is mounted only when ANALYTICS_ENABLED is exactly
 * "true" — off everywhere by default (including local dev), same shape as
 * reliability-flag.ts. Every stored event costs Atlas free-tier storage,
 * so turning ingest on must be a deliberate choice per environment.
 */
export function isAnalyticsEnabled(): boolean {
  return env.ANALYTICS_ENABLED === "true";
}
