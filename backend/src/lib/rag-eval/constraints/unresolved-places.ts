import type { ConstraintTrip, ConstraintResult } from "./types";

function isUnresolved(coords: [number, number] | undefined): boolean {
  return !coords || (coords[0] === 0 && coords[1] === 0);
}

/**
 * trip.processor.ts:340-351's passthrough guard fabricates a place with
 * coordinates: [0,0] (from the raw, unresolved LLM query string) whenever
 * validateBatch() resolves nothing — labeled "[DEV MODE]" in its log but
 * running unconditionally in production, and the trip still ends
 * COMPLETED. This makes that hallucination rate measurable in aggregate.
 */
export function checkUnresolvedPlaces(trip: ConstraintTrip): ConstraintResult {
  let total = 0;
  let unresolved = 0;

  for (const day of trip.itinerary) {
    for (const activity of day.activities) {
      total++;
      if (isUnresolved(activity.location?.coordinates)) unresolved++;
    }
  }

  const rate = total === 0 ? 0 : unresolved / total;

  return {
    pass: unresolved === 0,
    summary: `${unresolved}/${total} activities have unresolved (missing or [0,0]) coordinates`,
    metric: rate,
  };
}
