import { describe, it, expect, vi, beforeEach } from "vitest";
import { EMBEDDING_DIMS } from "./embedding.service";

/**
 * The Atlas `$vectorSearch` index `placeinsights_vector_index` used by
 * `place-insight-retrieval.service.ts` was only ever created by hand in the
 * Atlas UI — nothing in the repo defines it, so a fresh clone (or a fresh
 * Atlas project) has RAG silently degrade to the legacy `insightText`
 * fallback (which is also always empty, see insight-queue.test.ts) with no
 * error surfaced anywhere. This module makes the definition code, and
 * `ensureVectorIndex()` lets it be created/verified idempotently instead of
 * living only in one person's memory of clicking through the Atlas UI.
 */

const createSearchIndex = vi.fn();
vi.mock("../models/PlaceInsight", () => ({
  PlaceInsight: {
    collection: {
      createSearchIndex: (...a: unknown[]) => createSearchIndex(...a),
    },
  },
}));

describe("vector-index.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("VECTOR_INDEX_DEFINITION's vector field dims match EMBEDDING_DIMS", async () => {
    const { VECTOR_INDEX_DEFINITION } = await import("./vector-index.service");
    const vectorField = VECTOR_INDEX_DEFINITION.definition.fields.find(
      (f) => f.type === "vector",
    );
    expect(vectorField?.numDimensions).toBe(EMBEDDING_DIMS);
    expect(vectorField?.path).toBe("embedding");
  });

  it("VECTOR_INDEX_DEFINITION declares cityIdKey as a filter field (required by the $vectorSearch pre-filter)", async () => {
    const { VECTOR_INDEX_DEFINITION } = await import("./vector-index.service");
    const filterField = VECTOR_INDEX_DEFINITION.definition.fields.find(
      (f) => f.type === "filter",
    );
    expect(filterField?.path).toBe("cityIdKey");
  });

  it("ensureVectorIndex() creates the index and reports created: true on first run", async () => {
    createSearchIndex.mockResolvedValue("placeinsights_vector_index");
    const { ensureVectorIndex, VECTOR_INDEX_DEFINITION } =
      await import("./vector-index.service");

    const result = await ensureVectorIndex();

    expect(createSearchIndex).toHaveBeenCalledWith(VECTOR_INDEX_DEFINITION);
    expect(result).toEqual({
      created: true,
      name: "placeinsights_vector_index",
    });
  });

  it("ensureVectorIndex() is idempotent — swallows an 'already exists' error and reports created: false", async () => {
    createSearchIndex.mockRejectedValue(new Error("Index already exists"));
    const { ensureVectorIndex } = await import("./vector-index.service");

    const result = await ensureVectorIndex();

    expect(result).toEqual({
      created: false,
      name: "placeinsights_vector_index",
    });
  });

  it("ensureVectorIndex() rethrows unrelated errors instead of swallowing them", async () => {
    createSearchIndex.mockRejectedValue(new Error("connection refused"));
    const { ensureVectorIndex } = await import("./vector-index.service");

    await expect(ensureVectorIndex()).rejects.toThrow("connection refused");
  });
});
