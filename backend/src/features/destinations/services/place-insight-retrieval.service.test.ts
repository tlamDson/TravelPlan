import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Split from a single opaque `getRelevantPlaceInsights(): Promise<string>`
 * into a structured `retrievePlaceInsights()` (used by the RAG eval
 * harness, `.claude/plans/1-rag-eval-eventual-hickey.md` Phase 1-3). The
 * old `$project` excluded `_id` (`_id: 0`), which made ground-truth
 * labeling for a golden set impossible — there was no stable id to grade
 * against. Now projects `_id` back in as `id` (still paired with the
 * existing unique `{ cityIdKey, name }` index for stability across
 * re-scrapes). `getRelevantPlaceInsights()` keeps its exact old
 * signature/behavior — trip.processor.ts, its only caller, is unchanged.
 *
 * The pure pieces (buildRetrievalQuery, formatInsightsForPrompt) were
 * split into retrieval-shared.ts — see retrieval-shared.test.ts.
 */

const mockAggregate = vi.fn();
vi.mock("../models/PlaceInsight", () => ({
  PlaceInsight: { aggregate: (...a: unknown[]) => mockAggregate(...a) },
}));

const mockEmbedText = vi.fn();
vi.mock("./embedding.service", () => ({
  embedText: (...a: unknown[]) => mockEmbedText(...a),
  EMBEDDING_DIMS: 3072,
}));

const mockResolveCityFromDestination = vi.fn();
const mockGetCityInsight = vi.fn();
vi.mock("./destination-lookup.service", () => ({
  resolveCityFromDestination: (...a: unknown[]) =>
    mockResolveCityFromDestination(...a),
  getCityInsight: (...a: unknown[]) => mockGetCityInsight(...a),
}));

const RAW_RESULT = {
  _id: "66f0000000000000000000a1",
  cityIdKey: "hanoi",
  name: "Old Quarter",
  category: "history",
  description: "Historic core of Hanoi with narrow streets.",
  tags: ["walkable", "historic"],
  score: 0.87,
};

describe("place-insight-retrieval.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedText.mockResolvedValue(new Array(3072).fill(0));
  });

  describe("retrievePlaceInsights", () => {
    it("returns structured results including a stable id (regression: used to project _id: 0)", async () => {
      mockAggregate.mockResolvedValue([RAW_RESULT]);
      const { retrievePlaceInsights } =
        await import("./place-insight-retrieval.service");

      const results = await retrievePlaceInsights(
        "Hanoi, Vietnam",
        { cityIdKey: "hanoi", countryIdKey: "vn" },
        { focus: ["Culture"] } as never,
      );

      expect(results).toEqual([
        {
          id: "66f0000000000000000000a1",
          cityIdKey: "hanoi",
          name: "Old Quarter",
          category: "history",
          description: "Historic core of Hanoi with narrow streets.",
          tags: ["walkable", "historic"],
          score: 0.87,
        },
      ]);
    });

    it("returns [] without querying Mongo when no cityIdKey can be resolved", async () => {
      mockResolveCityFromDestination.mockResolvedValue(null);
      const { retrievePlaceInsights } =
        await import("./place-insight-retrieval.service");

      const results = await retrievePlaceInsights(
        "Nowhereville",
        {},
        {} as never,
      );

      expect(results).toEqual([]);
      expect(mockAggregate).not.toHaveBeenCalled();
    });

    it("returns [] (not a throw) when the $vectorSearch aggregate rejects — e.g. index not created", async () => {
      mockAggregate.mockRejectedValue(new Error("index not found"));
      const { retrievePlaceInsights } =
        await import("./place-insight-retrieval.service");

      const results = await retrievePlaceInsights(
        "Hanoi, Vietnam",
        { cityIdKey: "hanoi" },
        {} as never,
      );

      expect(results).toEqual([]);
    });

    it("returns [] when the vector search yields zero hits", async () => {
      mockAggregate.mockResolvedValue([]);
      const { retrievePlaceInsights } =
        await import("./place-insight-retrieval.service");

      const results = await retrievePlaceInsights(
        "Hanoi, Vietnam",
        { cityIdKey: "hanoi" },
        {} as never,
      );

      expect(results).toEqual([]);
    });
  });

  // buildRetrievalQuery / formatInsightsForPrompt are pure and now live in
  // retrieval-shared.ts — see retrieval-shared.test.ts. Both are still
  // re-exported from this module for backward compatibility (kept exactly
  // as covered by the "returns the formatted vector search results..." case
  // below, which exercises the re-export indirectly via getRelevantPlaceInsights).

  describe("getRelevantPlaceInsights (unchanged external signature/behavior)", () => {
    it("returns the formatted vector search results when the vector path finds something", async () => {
      mockAggregate.mockResolvedValue([RAW_RESULT]);
      const { getRelevantPlaceInsights } =
        await import("./place-insight-retrieval.service");

      const text = await getRelevantPlaceInsights(
        "Hanoi, Vietnam",
        { cityIdKey: "hanoi", countryIdKey: "vn" },
        {} as never,
      );

      expect(text).toBe(
        "1. Old Quarter (history): Historic core of Hanoi with narrow streets.",
      );
      expect(mockGetCityInsight).not.toHaveBeenCalled();
    });

    it("falls back to the legacy getCityInsight() string when the vector path returns nothing", async () => {
      mockAggregate.mockResolvedValue([]);
      mockGetCityInsight.mockResolvedValue("Legacy blob about Hanoi.");
      const { getRelevantPlaceInsights } =
        await import("./place-insight-retrieval.service");

      const text = await getRelevantPlaceInsights(
        "Hanoi, Vietnam",
        { cityIdKey: "hanoi", countryIdKey: "vn" },
        {} as never,
      );

      expect(text).toBe("Legacy blob about Hanoi.");
      expect(mockGetCityInsight).toHaveBeenCalledWith("Hanoi, Vietnam", {
        countryIdKey: "vn",
        cityIdKey: "hanoi",
      });
    });

    it("returns empty string when both the vector path and the legacy fallback come up empty", async () => {
      mockAggregate.mockResolvedValue([]);
      mockGetCityInsight.mockResolvedValue(null);
      const { getRelevantPlaceInsights } =
        await import("./place-insight-retrieval.service");

      const text = await getRelevantPlaceInsights(
        "Hanoi, Vietnam",
        { cityIdKey: "hanoi" },
        {} as never,
      );

      expect(text).toBe("");
    });

    it("does not call resolveCityFromDestination twice when cityIdKey is already known (avoids a redundant DB lookup on the fallback path)", async () => {
      mockAggregate.mockResolvedValue([]);
      mockGetCityInsight.mockResolvedValue(null);
      const { getRelevantPlaceInsights } =
        await import("./place-insight-retrieval.service");

      await getRelevantPlaceInsights(
        "Hanoi, Vietnam",
        { cityIdKey: "hanoi", countryIdKey: "vn" },
        {} as never,
      );

      expect(mockResolveCityFromDestination).not.toHaveBeenCalled();
    });
  });
});
