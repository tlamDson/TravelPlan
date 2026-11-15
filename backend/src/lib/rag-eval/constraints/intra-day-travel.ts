import type { ConstraintTrip, ConstraintResult } from "./types";

/**
 * Deliberately does NOT recompute distances — itinerary-builder.ts already
 * writes requiresTransport/distanceFromPrevious per activity at generation
 * time (geo-validator.service.ts's THRESHOLDS_KM). This check just makes
 * that pre-computed signal visible in aggregate instead of only ever
 * surfacing as an advisory field nothing enforces.
 */
export function checkIntraDayTravel(trip: ConstraintTrip): ConstraintResult {
  let measured = 0;
  let flagged = 0;

  for (const day of trip.itinerary) {
    for (const activity of day.activities) {
      if (typeof activity.distanceFromPrevious === "number") {
        measured++;
        if (activity.requiresTransport) flagged++;
      }
    }
  }

  const rate = measured === 0 ? 0 : flagged / measured;

  return {
    pass: flagged === 0,
    summary: `${flagged}/${measured} consecutive-activity gaps exceed the comfortable distance for the trip's transport mode`,
    metric: rate,
  };
}
