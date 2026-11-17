/**
 * ActivityRegenService
 *
 * Handles regenerating a single itinerary activity with a unique, validated replacement.
 * Separate service to keep trip.controller.ts under the Rule-of-200 limit.
 *
 * Protocol:
 *  1. Generate a targeted search query via AI, passing existing names to avoid.
 *  2. Validate the query against Google Places / Mapbox.
 *  3. Confirm uniqueness (no name overlap with existing activities).
 *  4. Build a replacement IActivity-compatible object (same time/type as original).
 */

import { aiAgentService } from "./ai-agent.service";
import { validationService } from "./validation.service";
import { geoValidatorService } from "./geo-validator.service";
import type { TransportMode } from "./geo-validator.service";
import { logger } from "../../../lib/logger";
import type { IActivity } from "../models/Trip.types";

interface RegenOneParams {
  target: IActivity;
  destination: string;
  existingNames: string[];
  hint?: string;
}

/** True only for a [lng, lat] pair of two finite numbers (Mongoose defaults a missing location to `[]`). */
function hasValidCoordinates(activity: any): boolean {
  const c = activity?.location?.coordinates;
  return (
    Array.isArray(c) &&
    c.length >= 2 &&
    Number.isFinite(c[0]) &&
    Number.isFinite(c[1])
  );
}

/**
 * Recalculates distanceFromPrevious and requiresTransport for every activity
 * in a day after an insertion/replacement. Mutates the array in-place.
 */
export function recalcDayDistances(
  activities: IActivity[],
  mode: TransportMode = "walking",
): void {
  // First activity has no "previous" — clear any stale distance from a prior position
  if (activities.length > 0) {
    const first = activities[0] as any;
    delete first.distanceFromPrevious;
    delete first.requiresTransport;
  }

  for (let i = 1; i < activities.length; i++) {
    const prev = activities[i - 1] as any;
    const curr = activities[i] as any;

    if (hasValidCoordinates(prev) && hasValidCoordinates(curr)) {
      const result = geoValidatorService.validateDistance(
        prev.location.coordinates,
        curr.location.coordinates,
        mode,
      );
      curr.distanceFromPrevious = result.km;
      curr.requiresTransport = result.requiresTransport;
    } else {
      // Clear stale distance data if coordinates are missing
      delete curr.distanceFromPrevious;
      delete curr.requiresTransport;
    }
  }
}

const MAX_ATTEMPTS = 3;

export class ActivityRegenService {
  async regenOne({ target, destination, existingNames, hint }: RegenOneParams): Promise<IActivity> {
    const existingNamesLower = existingNames.map((n) => n.toLowerCase().trim());

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // 1. Generate a single replacement query, excluding all current places.
      //    If the user provided a hint, prepend it so the AI generates a targeted query.
      const queryCount = 1;
      const queries = hint
        ? await this.generateHintedQuery(hint, destination, existingNames)
        : await aiAgentService.generateSupplementaryQueries(
            queryCount,
            destination,
            existingNames,
          );

      if (queries.length === 0) {
        logger.warn(
          { destination, attempt },
          "⚠️ [REGEN] AI returned no queries — retrying",
        );
        continue;
      }

      const query = queries[0]!;

      // 2. Validate the query
      const validated = await validationService.validateIntent(query, destination);
      if (!validated) {
        logger.warn(
          { query, attempt },
          "⚠️ [REGEN] Validation returned null — retrying",
        );
        continue;
      }

      // 3. Uniqueness check — reject if same name as any existing activity
      const candidateName = validated.name.toLowerCase().trim();
      if (existingNamesLower.includes(candidateName)) {
        logger.info(
          { candidateName, attempt },
          "⚠️ [REGEN] Candidate is a duplicate — retrying",
        );
        continue;
      }

      // 4. Build replacement activity, preserving time/type from original
      const replacement: IActivity = {
        type: target.type,
        name: validated.name,
        status: "planned",
        order: target.order,
        ...(target.time && { time: target.time }),
        ...(target.endTime && { endTime: target.endTime }),
        ...(target.cost !== undefined && { cost: target.cost }),
        ...(validated.rating !== undefined && { rating: validated.rating }),
        ...(validated.priceLevel !== undefined && { priceLevel: validated.priceLevel }),
        ...(validated.photoUrl && { photoUrl: validated.photoUrl }),
        ...(validated.openingHours && { openingHours: validated.openingHours }),
        ...(validated.googlePlaceId && {
          location: {
            type: "Point",
            coordinates: validated.coordinates,
            googlePlaceId: validated.googlePlaceId,
          },
        }),
        ...(!validated.googlePlaceId && validated.coordinates && {
          location: {
            type: "Point",
            coordinates: validated.coordinates,
          },
        }),
      };

      logger.info(
        { name: replacement.name, attempt, destination },
        "✅ [REGEN] Replacement activity validated and unique",
      );
      return replacement;
    }

    logger.error(
      {
        destination,
        existingCount: existingNames.length,
        hint: hint ?? null,
        msg: "All 3 attempts returned no AI queries — check rawModel init and Gemini API key",
      },
      "❌ [REGEN] Exhausted all attempts — no unique alternative found",
    );
    throw new Error("NO_ALTERNATIVE_FOUND");
  }

  /**
   * Uses user's hint to generate a targeted search query via Gemini.
   * Falls back to generic supplementary query if AI fails.
   */
  private async generateHintedQuery(
    hint: string,
    destination: string,
    existingNames: string[],
  ): Promise<string[]> {
    try {
      const avoidList =
        existingNames.length > 0
          ? `Avoid: ${existingNames.slice(0, 15).join(", ")}.`
          : "";

      const prompt =
        `Generate 1 specific location search query for a place to visit in ${destination}. ` +
        `User requirement: "${hint}". ` +
        `${avoidList} ` +
        `Return ONLY a valid JSON array with 1 string, no markdown: ["query"]`;

      const results = await aiAgentService.generateSupplementaryQueriesRaw(prompt);
      if (results.length > 0) return results;
    } catch {
      // fall through to generic
    }
    return aiAgentService.generateSupplementaryQueries(1, destination, existingNames);
  }
}

export const activityRegenService = new ActivityRegenService();
