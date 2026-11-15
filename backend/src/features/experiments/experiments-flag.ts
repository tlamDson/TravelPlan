import { env } from "../../config/env";

/**
 * `/api/experiments/*` is mounted only when EXPERIMENTS_ENABLED is exactly
 * "true" — off everywhere by default, same shape as analytics-flag.ts.
 * When off, the web client gets 404 and renders every experiment's
 * default (control) experience.
 */
export function isExperimentsEnabled(): boolean {
  return env.EXPERIMENTS_ENABLED === "true";
}
