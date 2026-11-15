import { geoValidatorService } from "../../../features/planner/services/geo-validator.service";
import type { ConstraintTrip, ConstraintResult } from "./types";

/** An activity this far from the trip's own reference point is almost
 * certainly a wrong-city resolution, not just "on the edge of town". */
export const OUTLIER_THRESHOLD_KM = 50;

function isResolved(
  coords: [number, number] | undefined,
): coords is [number, number] {
  return !!coords && !(coords[0] === 0 && coords[1] === 0);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/**
 * Proxy for "does every activity actually belong to this destination
 * city" — NOT true containment against the destination's real boundary
 * (that needs live geocoding, out of scope for a pure/offline checker).
 * Flags activities implausibly far from the trip's own reference point,
 * which is exactly the shape of the real documented bug:
 * validation.service.ts's Mapbox fallback uses the raw AI query with no
 * destination city appended, so it can resolve to a same-named place in a
 * different city entirely.
 *
 * Uses the per-axis MEDIAN coordinate as the reference point, not the
 * mean — a mean centroid gets dragged toward the outlier itself when
 * outliers are a small minority of activities (which is the realistic
 * case: 1 wrong-city activity among ~10-20 correct ones), understating
 * exactly the distances this check exists to measure. The median stays
 * anchored to the majority cluster as long as outliers are <50% of
 * activities.
 */
export function checkGeoOutliers(trip: ConstraintTrip): ConstraintResult {
  const coordsList: [number, number][] = [];
  for (const day of trip.itinerary) {
    for (const activity of day.activities) {
      const coords = activity.location?.coordinates;
      if (isResolved(coords)) coordsList.push(coords);
    }
  }

  if (coordsList.length === 0) {
    return {
      pass: true,
      summary: "no resolved activities to check",
      metric: 0,
    };
  }

  const reference: [number, number] = [
    median(coordsList.map((c) => c[0])),
    median(coordsList.map((c) => c[1])),
  ];

  const outliers = coordsList.filter(
    (c) => geoValidatorService.haversineKm(c, reference) > OUTLIER_THRESHOLD_KM,
  );

  return {
    pass: outliers.length === 0,
    summary: `${outliers.length}/${coordsList.length} activities are >${OUTLIER_THRESHOLD_KM}km from the trip's own median location — likely wrong-city resolution`,
    metric: outliers.length,
  };
}
