import { placeCacheRepository } from "../repositories/place-cache.repository";
import { mapboxBreaker, placesTextBreaker } from "../tools/circuit-breaker";
import { logger } from "../../../lib/logger";
import type { OpeningPeriod } from "./opening-hours";

export interface ValidatedPlace {
  name: string;
  coordinates: [number, number]; // [lng, lat]
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  googlePlaceId?: string;
  confidence: number;
  source: "cache" | "mapbox" | "google" | "both";
  categories?: string[];
  photoUrl?: string;
  openingHours?: string;
  openingHoursArray?: string[];
  openingPeriods?: OpeningPeriod[];
}

const BROAD_MAPBOX_TYPES = new Set(["place", "region", "country"]);

/**
 * Returns search radius (metres) based on trip pace and transport mode.
 * Used to geo-bias Place searches — packed/car trips can span wider areas.
 */
export function dynamicRadius(
  pace?: "relaxed" | "balanced" | "packed",
  transport?: string,
): number {
  const byCar = transport === "car" || transport === "driving";
  if (byCar) return pace === "packed" ? 3000 : 2000;
  return pace === "packed" ? 1500 : 800; // walking / default
}

export class ValidationService {
  private isBroadCachedPlace(place: any): boolean {
    const type = place?.placeType?.toLowerCase?.() ?? "";
    if (BROAD_MAPBOX_TYPES.has(type)) return true;

    const name = place?.placeName?.toLowerCase?.() ?? "";
    if (place?.source === "mapbox" && name.includes("united states"))
      return true;

    return false;
  }

  async validateIntent(
    intent: string,
    destination?: string,
  ): Promise<ValidatedPlace | null> {
    try {
      // Append destination to geo-constrain results — prevents queries like
      // "Paris Baguette" from resolving to "Paris Baguette Cao Thắng" in
      // Vietnam. Computed up front so the cache is keyed by the same string
      // actually sent to Google — keying by raw `intent` let two trips with
      // the same intent in different cities ("Old Quarter" in Hanoi vs.
      // Prague) collide on one cache entry and return each other's coords.
      const destCity = (destination?.split(",")[0] ?? "").trim();
      const alreadyContainsDest =
        destCity.length > 0 &&
        intent.toLowerCase().includes(destCity.toLowerCase());
      const geoConstrainedQuery =
        destCity && !alreadyContainsDest ? `${intent}, ${destCity}` : intent;

      // 1. Cache check
      const cached =
        await placeCacheRepository.findByQuery(geoConstrainedQuery);
      if (cached) {
        if (this.isBroadCachedPlace(cached)) {
          logger.info(
            {
              intent,
              placeName: cached.placeName,
              placeType: cached.placeType,
            },
            "Validation: Ignoring broad cached location",
          );
        } else {
          logger.debug({ intent }, "Validation: Cache hit");
          const result: ValidatedPlace = {
            name: cached.placeName,
            coordinates: cached.coordinates.coordinates as [number, number],
            confidence: cached.confidence,
            source: "cache",
          };
          if (cached.rating !== undefined) result.rating = cached.rating;
          if (cached.reviewCount !== undefined)
            result.reviewCount = cached.reviewCount;
          if (cached.priceLevel !== undefined)
            result.priceLevel = cached.priceLevel;
          if (cached.googlePlaceId) result.googlePlaceId = cached.googlePlaceId;
          if (cached.categories) result.categories = cached.categories;
          if (cached.photoUrl) result.photoUrl = cached.photoUrl;
          if (cached.openingHoursArray)
            result.openingHoursArray = cached.openingHoursArray;
          if (cached.openingPeriods?.length)
            result.openingPeriods = cached.openingPeriods;
          if (cached.openingHours) result.openingHours = cached.openingHours;
          return result;
        }
      }

      // 2. PRIMARY: Google Places Text Search
      logger.info(
        { intent, geoConstrainedQuery },
        "Validation: Querying Google Places v1 Text Search",
      );
      // Use circuit breaker — falls back to Mapbox if Google Places fails 3+ times
      const place = await placesTextBreaker
        .fire(geoConstrainedQuery)
        .catch(() => null);

      if (place && place.location) {
        const [lat, lng] = [place.location.lat, place.location.lng];

        const result: ValidatedPlace = {
          name: place.name,
          coordinates: [lng, lat],
          googlePlaceId: place.placeId,
          confidence: 0.95,
          source: "google",
        };
        if (place.rating !== undefined) result.rating = place.rating;
        if (place.reviewCount !== undefined)
          result.reviewCount = place.reviewCount;
        if (place.priceLevel !== undefined)
          result.priceLevel = place.priceLevel;
        if (place.categories) result.categories = place.categories;
        if (place.photoUrl) result.photoUrl = place.photoUrl;
        if (place.openingHoursArray)
          result.openingHoursArray = place.openingHoursArray;
        if (place.openingPeriods) result.openingPeriods = place.openingPeriods;
        if (place.openingHours) result.openingHours = place.openingHours; // legacy fallback

        // Cache the result, keyed by the same geo-constrained string that
        // was actually queried (see comment above `destCity`), and upsert
        // rather than create — `query` has no unique index, and
        // validateBatch() fires every intent concurrently via
        // Promise.allSettled, so duplicate intents in one batch would
        // otherwise race into duplicate documents.
        const cacheData: any = {
          coordinates: { type: "Point", coordinates: [lng, lat] },
          placeName: place.name,
          placeType: place.categories?.[0] ?? "poi",
          confidence: 0.95,
          googlePlaceId: place.placeId,
          source: "google",
          isVerified: true,
        };
        if (place.rating !== undefined) cacheData.rating = place.rating;
        if (place.reviewCount !== undefined)
          cacheData.reviewCount = place.reviewCount;
        if (place.priceLevel !== undefined)
          cacheData.priceLevel = place.priceLevel;
        if (place.categories) cacheData.categories = place.categories;
        if (place.photoUrl) cacheData.photoUrl = place.photoUrl;
        if (place.openingHoursArray)
          cacheData.openingHoursArray = place.openingHoursArray;
        if (place.openingPeriods)
          cacheData.openingPeriods = place.openingPeriods;
        if (place.openingHours) cacheData.openingHours = place.openingHours;

        await placeCacheRepository.upsert(geoConstrainedQuery, cacheData);

        logger.debug(
          { intent, name: place.name, lat, lng, rating: place.rating },
          "Validation: Google Places match found",
        );
        return result;
      }

      // 3. FALLBACK: Mapbox geocoding (when Google Places fails or key missing)
      logger.debug(
        { intent },
        "Validation: Google Places failed, falling back to Mapbox",
      );
      const geocode = await mapboxBreaker.fire(intent);

      if (!geocode) {
        logger.debug({ intent }, "Validation: Mapbox returned no results");
        return null;
      }

      if (BROAD_MAPBOX_TYPES.has(geocode.placeType)) {
        logger.info(
          {
            intent,
            placeName: geocode.placeName,
            placeType: geocode.placeType,
          },
          "Validation: Ignoring broad Mapbox location",
        );
        return null;
      }

      const [lng, lat] = geocode.coordinates;

      const mapboxResult: ValidatedPlace = {
        name: geocode.placeName,
        coordinates: [lng, lat],
        confidence: geocode.confidence,
        source: "mapbox",
      };

      // Keyed the same way as the Google branch above so a later lookup for
      // this (intent, destination) pair hits what this call wrote.
      await placeCacheRepository.upsert(geoConstrainedQuery, {
        coordinates: { type: "Point", coordinates: [lng, lat] },
        placeName: geocode.placeName,
        placeType: geocode.placeType,
        confidence: geocode.confidence,
        source: "mapbox",
        isVerified: true,
      });

      return mapboxResult;
    } catch (error: any) {
      logger.error({ intent, error: error.message }, "Validation failed");
      return null;
    }
  }

  async validateBatch(
    intents: string[],
    destination?: string,
  ): Promise<ValidatedPlace[]> {
    logger.info(
      { count: intents.length, destination },
      "Validating batch of intents",
    );

    const results = await Promise.allSettled(
      intents.map((intent) => this.validateIntent(intent, destination)),
    );

    const validated = results
      .filter((r) => r.status === "fulfilled" && r.value !== null)
      .map((r: any) => r.value);

    logger.info(
      { total: intents.length, validated: validated.length },
      "Batch validation complete",
    );

    return validated;
  }
}

export const validationService = new ValidationService();
