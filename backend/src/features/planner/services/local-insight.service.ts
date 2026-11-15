/**
 * Fetches RAG local insight (Atlas $vectorSearch → legacy insightText
 * fallback) with structured metadata, for injection into the trip
 * generation prompt and persistence on Trip.generationMeta.
 *
 * Shared by trip.processor.ts (standard path) and
 * itinerary-chunker.service.ts (Pro >5-day path) — previously the chunker
 * never called RAG retrieval at all, a duplication-drift bug that having
 * one shared function instead of two inline copies makes structurally
 * harder to repeat.
 */
import type { TripPreferences } from "@travelplan/shared";
import { logger } from "../../../lib/logger";
import {
  retrievePlaceInsights,
  formatInsightsForPrompt,
} from "../../destinations/services/place-insight-retrieval.service";
import { getCityInsight } from "../../destinations/services/destination-lookup.service";

export interface LocalInsightResult {
  localInsight: string | null;
  ragUsed: boolean;
  ragResultCount: number;
  ragAvgScore: number | null;
  ragFallbackReason: string | null;
}

export async function fetchLocalInsightWithMeta(
  preferences: TripPreferences,
  logContext: Record<string, unknown> = {},
): Promise<LocalInsightResult> {
  const ragOpts = {
    ...(preferences.countryIdKey
      ? { countryIdKey: preferences.countryIdKey }
      : {}),
    ...(preferences.cityIdKey ? { cityIdKey: preferences.cityIdKey } : {}),
  };

  try {
    const ragResults = await retrievePlaceInsights(
      preferences.destination,
      ragOpts,
      preferences,
    );

    if (ragResults.length > 0) {
      const ragAvgScore =
        ragResults.reduce((sum, r) => sum + r.score, 0) / ragResults.length;
      logger.info(
        { ...logContext, ragResultCount: ragResults.length, ragAvgScore },
        "✅ [RAG_USED] Vector search found local insight — injecting into AI prompt",
      );
      return {
        localInsight: formatInsightsForPrompt(ragResults),
        ragUsed: true,
        ragResultCount: ragResults.length,
        ragAvgScore,
        ragFallbackReason: null,
      };
    }

    const legacyInsight =
      (await getCityInsight(preferences.destination, ragOpts)) ?? null;
    const ragFallbackReason = legacyInsight
      ? "legacy_insight_text"
      : "no_insight_found";
    logger.warn(
      {
        ...logContext,
        destination: preferences.destination,
        ragFallbackReason,
      },
      "⚠️ [RAG_USED] Vector search returned nothing — falling back",
    );
    return {
      localInsight: legacyInsight,
      ragUsed: false,
      ragResultCount: 0,
      ragAvgScore: null,
      ragFallbackReason,
    };
  } catch (ragErr) {
    logger.error(
      {
        ...logContext,
        ragErr: ragErr instanceof Error ? ragErr.message : String(ragErr),
        destination: preferences.destination,
      },
      "❌ [RAG_USED] Failed to fetch insight — continuing without it",
    );
    return {
      localInsight: null,
      ragUsed: false,
      ragResultCount: 0,
      ragAvgScore: null,
      ragFallbackReason: "rag_exception",
    };
  }
}
