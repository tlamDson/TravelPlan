import { env } from "../../config/env";

/**
 * `/api/reliability/*` — env-driven (mirrors calendar-feature-flag.ts's
 * shape), NOT NODE_ENV-driven like dev-routes-flag.ts. The whole point of
 * an SLO is to be visible in production, so unlike dev-only admin routes
 * this must be explicitly opt-in everywhere (including local dev) rather
 * than defaulting to on — an accidentally-exposed endpoint here is less
 * benign than a local convenience toggle.
 */
export function isReliabilityApiEnabled(): boolean {
  return env.ENABLE_RELIABILITY_API === "true";
}
