/**
 * Definition + idempotent creation for the Atlas `$vectorSearch` index that
 * `place-insight-retrieval.service.ts` queries. This index previously only
 * existed as a click-through in the Atlas UI — nothing in the repo defined
 * it, so a fresh Atlas project (or anyone auditing what RAG actually needs
 * infra-wise) had no way to know its shape. See `ensure-vector-index.ts`
 * for the CLI runner.
 */
import { PlaceInsight } from "../models/PlaceInsight";
import { EMBEDDING_DIMS } from "./embedding.service";
import { logger } from "../../../lib/logger";

export const VECTOR_INDEX_NAME = "placeinsights_vector_index";

export const VECTOR_INDEX_DEFINITION = {
  name: VECTOR_INDEX_NAME,
  type: "vectorSearch" as const,
  definition: {
    fields: [
      {
        type: "vector" as const,
        path: "embedding",
        numDimensions: EMBEDDING_DIMS,
        similarity: "cosine" as const,
      },
      // Required so $vectorSearch's `filter: { cityIdKey }` pre-filter
      // (place-insight-retrieval.service.ts) can actually use the index.
      { type: "filter" as const, path: "cityIdKey" },
    ],
  },
};

/** Idempotent: safe to call on every deploy/seed run. */
export async function ensureVectorIndex(): Promise<{
  created: boolean;
  name: string;
}> {
  try {
    await PlaceInsight.collection.createSearchIndex(VECTOR_INDEX_DEFINITION);
    logger.info({ index: VECTOR_INDEX_NAME }, "Vector search index created");
    return { created: true, name: VECTOR_INDEX_NAME };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists|IndexAlreadyExists|duplicate/i.test(message)) {
      logger.info(
        { index: VECTOR_INDEX_NAME },
        "Vector search index already exists — skipping",
      );
      return { created: false, name: VECTOR_INDEX_NAME };
    }
    throw error;
  }
}
