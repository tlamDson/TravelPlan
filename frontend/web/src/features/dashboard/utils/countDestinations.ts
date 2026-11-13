import type { Trip } from "@/features/planner/api/trips.api";

/**
 * Number of distinct destinations across the user's trips. Trips store the
 * destination in `trip.destination` (e.g. "Tokyo, Japan"); `trip.cities` is
 * only filled for manually built multi-city trips, so it is not a reliable
 * source for this count.
 */
export function countDestinations(
  trips: ReadonlyArray<Pick<Trip, "destination">> | undefined,
): number {
  const distinct = new Set<string>();
  for (const trip of trips ?? []) {
    const key = trip.destination?.trim().replace(/\s+/g, " ").toLowerCase();
    if (key) distinct.add(key);
  }
  return distinct.size;
}
