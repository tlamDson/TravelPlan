import axios from "axios";
import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";
import { resolveBestPhotoUrl } from "./place-photo.service";
import type { OpeningPeriod } from "./opening-hours";

export interface PlaceDetails {
  placeId: string;
  name: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  isOpen?: boolean;
  photoUrl?: string; // resolved CDN URL (no API key exposed)
  openingHours?: string;
  openingHoursArray?: string[];
  openingPeriods?: OpeningPeriod[];
  categories?: string[];
  location?: { lat: number; lng: number };
}

// Field mask: request ONLY the fields we need (cost optimization)
const TEXT_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.currentOpeningHours",
  "places.photos",
  "places.types",
].join(",");

const BROAD_PLACE_TYPES = new Set([
  "locality",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "country",
  "postal_code",
  "postal_code_suffix",
  "political",
  "route",
  "street_address",
  "premise",
  "neighborhood",
  "colloquial_area",
  "intersection",
]);

export class PlacesService {
  private readonly v1Base = "https://places.googleapis.com/v1";

  private isBroadPlace(types?: string[]): boolean {
    if (!types || types.length === 0) return false;
    return types.some((type) => BROAD_PLACE_TYPES.has(type));
  }

  /**
   * PRIMARY: Text Search via Places API v1 (POST).
   * Single-call hydration: returns name, coords, rating, photos, hours in one request.
   * Field masking minimizes billing tier.
   */
  async searchByText(query: string): Promise<PlaceDetails | null> {
    if (!env.GOOGLE_PLACES_API_KEY) {
      logger.warn(
        "Google Places API key not configured — skipping Text Search",
      );
      return null;
    }

    try {
      logger.info({ query }, "📍 [PLACES v1] Calling searchText");

      const response = await axios.post(
        `${this.v1Base}/places:searchText`,
        { textQuery: query },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
          },
          timeout: 6000,
        },
      );

      const places = response.data?.places;
      if (!places || places.length === 0) {
        logger.debug({ query }, "📍 [PLACES v1] No results found");
        return null;
      }

      const place =
        places.find((candidate: any) => !this.isBroadPlace(candidate.types)) ??
        places[0];

      if (!place || this.isBroadPlace(place.types)) {
        logger.info(
          {
            query,
            topTypes: place?.types ?? [],
            topName: place?.displayName?.text,
          },
          "📍 [PLACES v1] Broad location match ignored",
        );
        return null;
      }

      const name = place.displayName?.text || "Unknown Place";
      logger.info(
        {
          query,
          name,
          lat: place.location?.latitude,
          lng: place.location?.longitude,
          rating: place.rating,
        },
        "📍 [PLACES v1] Text Search matched place",
      );

      const details: PlaceDetails = { placeId: place.id, name };

      if (place.rating !== undefined) details.rating = place.rating;
      if (place.userRatingCount !== undefined)
        details.reviewCount = place.userRatingCount;

      if (place.priceLevel) {
        const match = place.priceLevel.match(/PRICE_LEVEL_(\w+)/);
        if (match) {
          const levelMap: Record<string, number> = {
            FREE: 0,
            INEXPENSIVE: 1,
            MODERATE: 2,
            EXPENSIVE: 3,
            VERY_EXPENSIVE: 4,
          };
          const level = levelMap[match[1]];
          if (level !== undefined) details.priceLevel = level;
        }
      }

      if (place.types) details.categories = place.types;
      if (place.location) {
        details.location = {
          lat: place.location.latitude,
          lng: place.location.longitude,
        };
      }

      if (place.currentOpeningHours) {
        if (place.currentOpeningHours.openNow !== undefined) {
          details.isOpen = place.currentOpeningHours.openNow;
        }
        if (place.currentOpeningHours.weekdayDescriptions) {
          details.openingHoursArray =
            place.currentOpeningHours.weekdayDescriptions;
        }
        if (Array.isArray(place.currentOpeningHours.periods)) {
          details.openingPeriods = place.currentOpeningHours.periods;
        }
      }

      if (place.photos && place.photos.length > 0) {
        const cdnUrl = await resolveBestPhotoUrl(place.photos);
        if (cdnUrl) {
          details.photoUrl = cdnUrl;
          logger.debug({ name }, "📍 [PLACES v1] Photo CDN URL resolved");
        }
      }

      return details;
    } catch (error: any) {
      logger.error(
        {
          query,
          status: error.response?.status,
          statusText: error.response?.statusText,
          errorBody: error.response?.data?.error?.message,
          error: error.message,
        },
        "📍 [PLACES v1] Text Search failed",
      );
      return null;
    }
  }

  /** Legacy — kept for circuit breaker compatibility */
  async verifyPlace(
    _lat: number,
    _lng: number,
    _radius = 100,
  ): Promise<PlaceDetails | null> {
    return null;
  }
}

export const placesService = new PlacesService();
