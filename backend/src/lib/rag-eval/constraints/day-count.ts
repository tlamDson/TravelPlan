import type { ConstraintTrip, ConstraintResult } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Matches itinerary-builder.ts's own expectedDays formula exactly
 * (Math.round((end-start)/msPerDay) + 1) — this checks the itinerary
 * against the pipeline's own definition of "correct" day count, not an
 * independently invented one. Real cause of mismatches in production:
 * the prompt sizes days from PACE_CONFIG[pace].activitiesPerDay (2/4/6)
 * while buildItinerary sizes clusters from preferences.activitiesPerDay
 * ?? 3 — two different sources of truth that routinely disagree.
 */
export function checkDayCount(trip: ConstraintTrip): ConstraintResult {
  const expectedDays =
    Math.round(
      (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) /
        MS_PER_DAY,
    ) + 1;
  const actualDays = trip.itinerary.length;
  const pass = actualDays === expectedDays;

  return {
    pass,
    summary: pass
      ? `itinerary has the expected ${expectedDays} day(s)`
      : `itinerary has ${actualDays} day(s), expected ${expectedDays} (implied by startDate/endDate)`,
    metric: actualDays - expectedDays,
  };
}
