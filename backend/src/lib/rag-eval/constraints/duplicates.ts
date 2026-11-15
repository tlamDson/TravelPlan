import { geoValidatorService } from "../../../features/planner/services/geo-validator.service";
import type {
  ConstraintActivity,
  ConstraintTrip,
  ConstraintResult,
} from "./types";

/** Mirrors trip.processor.ts's dedupeValidatedPlaces() MIN_DUPLICATE_DISTANCE_KM. */
const DUPLICATE_DISTANCE_KM = 0.1;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function isResolved(
  coords: [number, number] | undefined,
): coords is [number, number] {
  return !!coords && !(coords[0] === 0 && coords[1] === 0);
}

interface Seen {
  name: string;
  googlePlaceId: string | undefined;
  coords: [number, number] | undefined;
}

function matchesSeen(activity: ConstraintActivity, seen: Seen): boolean {
  if (normalizeName(activity.name) === seen.name) return true;

  const placeId = activity.location?.googlePlaceId;
  if (placeId && seen.googlePlaceId && placeId === seen.googlePlaceId)
    return true;

  const coords = activity.location?.coordinates;
  if (isResolved(coords) && isResolved(seen.coords)) {
    return (
      geoValidatorService.haversineKm(coords, seen.coords) <=
      DUPLICATE_DISTANCE_KM
    );
  }

  return false;
}

/**
 * Mirrors trip.processor.ts's dedupeValidatedPlaces() rules (name,
 * googlePlaceId, or <=0.1km) but applied to the *final* itinerary — which
 * is what actually catches the documented gap: the Pro-chunked generation
 * path (itinerary-chunker.service.ts) skips dedupe entirely, so
 * duplicates across chunk boundaries only ever show up in the finished
 * trip, never in a single chunk's own output.
 */
export function checkNoDuplicates(trip: ConstraintTrip): ConstraintResult {
  const seen: Seen[] = [];
  let total = 0;
  let duplicates = 0;

  for (const day of trip.itinerary) {
    for (const activity of day.activities) {
      total++;
      const isDup = seen.some((s) => matchesSeen(activity, s));
      if (isDup) duplicates++;

      seen.push({
        name: normalizeName(activity.name),
        googlePlaceId: activity.location?.googlePlaceId,
        coords: activity.location?.coordinates,
      });
    }
  }

  return {
    pass: duplicates === 0,
    summary: `${duplicates}/${total} activities duplicate an earlier activity in the same trip (by name, googlePlaceId, or <=${DUPLICATE_DISTANCE_KM}km)`,
    metric: duplicates,
  };
}
