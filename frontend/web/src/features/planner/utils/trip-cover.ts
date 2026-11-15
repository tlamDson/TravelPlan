import type { Trip } from "@/features/planner/api/trips.api";
import { getCountryImage } from "@/utils/countryImage";

/** First place photo found in the itinerary, in day then activity order. */
export function firstActivityPhoto(
  itinerary: Trip["itinerary"] | undefined,
): string | null {
  for (const day of itinerary ?? []) {
    for (const activity of day.activities ?? []) {
      if (activity.photoUrl) return activity.photoUrl;
    }
  }
  return null;
}

/**
 * Cover image for a trip card: explicit cover, then the country image, then a
 * photo of a place in the itinerary (countries without bundled images, e.g.
 * Japan), else null (callers render a neutral placeholder).
 */
export function getTripCoverSrc(
  trip: Pick<
    Trip,
    "_id" | "title" | "destination" | "coverImage" | "itinerary"
  >,
): string | null {
  return (
    trip.coverImage ||
    getCountryImage(trip.destination || trip.title, trip._id) ||
    firstActivityPhoto(trip.itinerary)
  );
}
