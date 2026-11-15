import type { IGenerationMeta, IItineraryDay } from "../models/Trip.types";

/**
 * Counts activities left at trip.processor.ts's passthrough-guard
 * fabrication coordinates ([0,0], from a raw unresolved LLM query string)
 * or with no location at all. Shared by trip.processor.ts and
 * itinerary-chunker.service.ts so Trip.generationMeta.unresolvedPlaceCount
 * means the same thing on both generation paths.
 */
export function countUnresolvedPlaces(itinerary: IItineraryDay[]): number {
  let count = 0;
  for (const day of itinerary) {
    for (const activity of day.activities) {
      const coords = activity.location?.coordinates;
      if (!coords || (coords[0] === 0 && coords[1] === 0)) count++;
    }
  }
  return count;
}

/** Assembles a Trip.generationMeta subdocument from the raw signals
 * captured across the RAG retrieval + AI generation calls. Rounds
 * ragAvgScore to 3 decimals, matching the [RAG_USED] log line's existing
 * .toFixed(3) convention — this is the one non-trivial piece of logic
 * here, everything else is passthrough. */
export function buildGenerationMeta(params: IGenerationMeta): IGenerationMeta {
  return {
    ...params,
    ragAvgScore:
      params.ragAvgScore !== null && params.ragAvgScore !== undefined
        ? Math.round(params.ragAvgScore * 1000) / 1000
        : (params.ragAvgScore ?? null),
  };
}
