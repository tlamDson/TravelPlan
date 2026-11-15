import type { TripPreferences } from "@travelplan/shared";
import { PlaceInsight } from "../models/PlaceInsight";
import { embedText } from "./embedding.service";
import { VECTOR_INDEX_NAME } from "./vector-index.service";
import {
  resolveCityFromDestination,
  getCityInsight,
} from "./destination-lookup.service";
import { logger } from "../../../lib/logger";
import {
  buildRetrievalQuery,
  formatInsightsForPrompt,
  type RetrievedInsight,
} from "./retrieval-shared";

export {
  buildRetrievalQuery,
  formatInsightsForPrompt,
} from "./retrieval-shared";
export type { RetrievedInsight } from "./retrieval-shared";

const TOP_K = 10;

interface CityKeys {
  countryIdKey?: string | undefined;
  cityIdKey?: string | undefined;
}

interface RetrievalOpts extends CityKeys {
  queryOverride?: string | undefined;
}

/** Resolves cityIdKey/countryIdKey from opts, or by parsing `destination`
 * when opts doesn't already carry them. Shared by retrievePlaceInsights
 * and getRelevantPlaceInsights's legacy fallback so a caller that already
 * knows its city keys (the common case — trip.processor.ts passes them
 * from the wizard's destination picker) never triggers a second DB
 * lookup. */
async function resolveCityKeys(
  destination: string,
  opts: CityKeys,
): Promise<CityKeys> {
  let { countryIdKey, cityIdKey } = opts;
  if (!cityIdKey && destination) {
    const resolved = await resolveCityFromDestination(destination);
    countryIdKey = resolved?.countryIdKey;
    cityIdKey = resolved?.cityIdKey;
  }
  return { countryIdKey, cityIdKey };
}

/**
 * Performs the Atlas `$vectorSearch` (RAG) query and returns structured,
 * id-bearing results — no formatting, no legacy fallback. Returns []
 * (never throws) when the city can't be resolved, the index/query errors
 * out, or the search simply finds nothing; callers decide what "nothing"
 * means for them (getRelevantPlaceInsights falls back to legacy
 * insightText, the eval harness just scores it as a miss).
 */
export async function retrievePlaceInsights(
  destination: string,
  opts: RetrievalOpts,
  preferences: TripPreferences,
): Promise<RetrievedInsight[]> {
  try {
    const { cityIdKey } = await resolveCityKeys(destination, opts);
    if (!cityIdKey) return [];

    const queryText =
      opts.queryOverride ?? buildRetrievalQuery(destination, preferences);
    const queryVector = await embedText(queryText);

    const results = await PlaceInsight.aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: "embedding",
          queryVector,
          numCandidates: 100, // Search space
          limit: TOP_K, // Final return size
          filter: { cityIdKey }, // Constrain search to this specific city
        },
      },
      {
        $project: {
          _id: 1,
          cityIdKey: 1,
          name: 1,
          category: 1,
          description: 1,
          tags: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ]);

    logger.info(
      {
        cityIdKey,
        queryText,
        queryVectorLength: queryVector.length,
        resultsCount: results.length,
        topResults: results.slice(0, 3).map((r) => ({
          name: r.name,
          category: r.category,
          score: r.score,
        })),
      },
      "🔍 RAG: Vector search executed",
    );

    return results.map((r) => ({
      id: String(r._id),
      cityIdKey: r.cityIdKey,
      name: r.name,
      category: r.category,
      description: r.description,
      tags: r.tags ?? [],
      score: r.score ?? 0,
    }));
  } catch (error) {
    logger.error(
      {
        destination,
        cityIdKey: opts.cityIdKey,
        countryIdKey: opts.countryIdKey,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "❌ RAG: Vector search failed (Index might not be created or model failed).",
    );
    return [];
  }
}

/**
 * Public entry point used by trip.processor.ts. Tries the vector search
 * first; if that comes up empty for any reason, falls back to the legacy
 * per-city insightText blob.
 */
export async function getRelevantPlaceInsights(
  destination: string,
  opts: RetrievalOpts,
  preferences: TripPreferences,
): Promise<string> {
  const { countryIdKey, cityIdKey } = await resolveCityKeys(destination, opts);

  const results = await retrievePlaceInsights(
    destination,
    { ...opts, countryIdKey, cityIdKey },
    preferences,
  );

  if (results.length > 0) {
    logger.info(
      {
        cityIdKey,
        resultCount: results.length,
        avgScore: (
          results.reduce((sum, r) => sum + r.score, 0) / results.length
        ).toFixed(3),
      },
      "✅ RAG: Vector search completed successfully — formatted results ready for LLM",
    );
    return formatInsightsForPrompt(results);
  }

  logger.warn(
    { cityIdKey, countryIdKey, destination },
    "⚠️ RAG: Vector search returned nothing, falling back to legacy insightText",
  );
  const fallbackOpts = {
    ...(countryIdKey ? { countryIdKey } : {}),
    ...(cityIdKey ? { cityIdKey } : {}),
  };
  return (await getCityInsight(destination, fallbackOpts)) ?? "";
}
