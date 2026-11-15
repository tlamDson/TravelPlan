import { checkDayCount } from "./day-count";
import { checkUnresolvedPlaces } from "./unresolved-places";
import { checkGeoOutliers } from "./geo-outliers";
import { checkIntraDayTravel } from "./intra-day-travel";
import { checkNoDuplicates } from "./duplicates";
import type { ConstraintTrip, ConstraintResult } from "./types";

export { checkDayCount } from "./day-count";
export { checkUnresolvedPlaces } from "./unresolved-places";
export { checkGeoOutliers, OUTLIER_THRESHOLD_KM } from "./geo-outliers";
export { checkIntraDayTravel } from "./intra-day-travel";
export { checkNoDuplicates } from "./duplicates";
export * from "./types";

/**
 * Zero-LLM-call, deterministic checks over a finished trip's itinerary.
 * Not a replacement for retrieval eval (metrics.ts) — these catch
 * generation-pipeline defects (hallucinated places, wrong-city
 * resolution, missed dedupe) that a 0-doc RAG corpus wouldn't surface at
 * all. Deliberately excludes a budget check: buildItinerary() never
 * writes a `cost` field onto activities, so there's nothing here to grade
 * against the user's budget yet — see
 * .claude/plans/1-rag-eval-eventual-hickey.md Phase 4.
 */
export const CONSTRAINT_CHECKS = {
  dayCount: checkDayCount,
  unresolvedPlaces: checkUnresolvedPlaces,
  geoOutliers: checkGeoOutliers,
  intraDayTravel: checkIntraDayTravel,
  noDuplicates: checkNoDuplicates,
} satisfies Record<string, (trip: ConstraintTrip) => ConstraintResult>;

export function runAllConstraintChecks(
  trip: ConstraintTrip,
): Record<keyof typeof CONSTRAINT_CHECKS, ConstraintResult> {
  const result = {} as Record<keyof typeof CONSTRAINT_CHECKS, ConstraintResult>;
  for (const key of Object.keys(CONSTRAINT_CHECKS) as Array<
    keyof typeof CONSTRAINT_CHECKS
  >) {
    result[key] = CONSTRAINT_CHECKS[key](trip);
  }
  return result;
}
