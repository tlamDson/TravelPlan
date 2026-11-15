import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TripPreferences } from "@travelplan/shared";

/**
 * Shared by trip.processor.ts and itinerary-chunker.service.ts — extracted
 * because itinerary-chunker.service.ts never called RAG retrieval at all
 * before this change (every Pro trip >5 days generated with zero local
 * grounding, less than free-tier trips got). Duplicating this logic
 * inline in both files is exactly how that drift happened in the first
 * place, so it's a single shared function now, not two copies.
 */

const mockRetrievePlaceInsights = vi.fn();
const mockFormatInsightsForPrompt = vi.fn();
vi.mock("../../destinations/services/place-insight-retrieval.service", () => ({
  retrievePlaceInsights: (...a: unknown[]) => mockRetrievePlaceInsights(...a),
  formatInsightsForPrompt: (...a: unknown[]) =>
    mockFormatInsightsForPrompt(...a),
}));

const mockGetCityInsight = vi.fn();
vi.mock("../../destinations/services/destination-lookup.service", () => ({
  getCityInsight: (...a: unknown[]) => mockGetCityInsight(...a),
}));

const preferences = {
  destination: "Hanoi, Vietnam",
  countryIdKey: "vn",
  cityIdKey: "hanoi",
} as unknown as TripPreferences;

describe("fetchLocalInsightWithMeta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ragUsed: true with an averaged score when the vector path finds results", async () => {
    mockRetrievePlaceInsights.mockResolvedValue([
      { score: 0.9 },
      { score: 0.7 },
    ]);
    mockFormatInsightsForPrompt.mockReturnValue(
      "1. Old Quarter\n2. Train Street",
    );

    const { fetchLocalInsightWithMeta } =
      await import("./local-insight.service");
    const result = await fetchLocalInsightWithMeta(preferences);

    expect(result).toEqual({
      localInsight: "1. Old Quarter\n2. Train Street",
      ragUsed: true,
      ragResultCount: 2,
      ragAvgScore: 0.8,
      ragFallbackReason: null,
    });
    expect(mockGetCityInsight).not.toHaveBeenCalled();
  });

  it("falls back to legacy getCityInsight and reports the reason when the vector path finds nothing", async () => {
    mockRetrievePlaceInsights.mockResolvedValue([]);
    mockGetCityInsight.mockResolvedValue("Legacy blob about Hanoi.");

    const { fetchLocalInsightWithMeta } =
      await import("./local-insight.service");
    const result = await fetchLocalInsightWithMeta(preferences);

    expect(result).toEqual({
      localInsight: "Legacy blob about Hanoi.",
      ragUsed: false,
      ragResultCount: 0,
      ragAvgScore: null,
      ragFallbackReason: "legacy_insight_text",
    });
  });

  it("reports no_insight_found when neither path produces anything", async () => {
    mockRetrievePlaceInsights.mockResolvedValue([]);
    mockGetCityInsight.mockResolvedValue(null);

    const { fetchLocalInsightWithMeta } =
      await import("./local-insight.service");
    const result = await fetchLocalInsightWithMeta(preferences);

    expect(result.localInsight).toBeNull();
    expect(result.ragFallbackReason).toBe("no_insight_found");
  });

  it("reports rag_exception and returns null insight when retrieval throws, without propagating the error", async () => {
    mockRetrievePlaceInsights.mockRejectedValue(new Error("Atlas timeout"));

    const { fetchLocalInsightWithMeta } =
      await import("./local-insight.service");
    const result = await fetchLocalInsightWithMeta(preferences);

    expect(result).toEqual({
      localInsight: null,
      ragUsed: false,
      ragResultCount: 0,
      ragAvgScore: null,
      ragFallbackReason: "rag_exception",
    });
  });
});
