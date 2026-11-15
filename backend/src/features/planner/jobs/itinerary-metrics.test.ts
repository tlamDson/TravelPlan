import { describe, it, expect } from "vitest";
import {
  countUnresolvedPlaces,
  buildGenerationMeta,
} from "./itinerary-metrics";
import type { IItineraryDay } from "../models/Trip.types";

const BASE_PARAMS = {
  ragUsed: true,
  ragResultCount: 5,
  ragAvgScore: 0.876543,
  ragFallbackReason: null,
  model: "gemini-3.6-flash",
  aiAttempts: 1,
  unresolvedPlaceCount: 0,
  promptTokens: 500,
  totalTokens: 700,
  latencyMs: 1200,
};

describe("countUnresolvedPlaces", () => {
  it("counts activities with [0,0] coordinates (the passthrough-guard fabrication)", () => {
    const itinerary = [
      {
        day: 1,
        date: new Date(),
        activities: [
          {
            type: "poi",
            name: "Old Quarter",
            location: {
              type: "Point" as const,
              coordinates: [105.85, 21.03] as [number, number],
            },
            status: "planned" as const,
            order: 0,
          },
          {
            type: "poi",
            name: "raw query",
            location: {
              type: "Point" as const,
              coordinates: [0, 0] as [number, number],
            },
            status: "planned" as const,
            order: 1,
          },
        ],
      },
    ] satisfies IItineraryDay[];

    expect(countUnresolvedPlaces(itinerary)).toBe(1);
  });

  it("counts an activity with no location field at all", () => {
    const itinerary = [
      {
        day: 1,
        date: new Date(),
        activities: [
          {
            type: "poi",
            name: "no location",
            status: "planned" as const,
            order: 0,
          },
        ],
      },
    ] satisfies IItineraryDay[];

    expect(countUnresolvedPlaces(itinerary)).toBe(1);
  });

  it("returns 0 for an itinerary with no unresolved places", () => {
    const itinerary = [
      {
        day: 1,
        date: new Date(),
        activities: [
          {
            type: "poi",
            name: "Old Quarter",
            location: {
              type: "Point" as const,
              coordinates: [105.85, 21.03] as [number, number],
            },
            status: "planned" as const,
            order: 0,
          },
        ],
      },
    ] satisfies IItineraryDay[];

    expect(countUnresolvedPlaces(itinerary)).toBe(0);
  });

  it("returns 0 for an empty itinerary", () => {
    expect(countUnresolvedPlaces([])).toBe(0);
  });
});

describe("buildGenerationMeta", () => {
  it("rounds ragAvgScore to 3 decimals, matching the log line's .toFixed(3) convention", () => {
    const meta = buildGenerationMeta(BASE_PARAMS);
    expect(meta.ragAvgScore).toBe(0.877);
  });

  it("passes every other field through unchanged", () => {
    const meta = buildGenerationMeta(BASE_PARAMS);
    expect(meta).toEqual({
      ...BASE_PARAMS,
      ragAvgScore: 0.877,
    });
  });

  it("leaves ragAvgScore as null when RAG wasn't used (nothing to round)", () => {
    const meta = buildGenerationMeta({
      ...BASE_PARAMS,
      ragUsed: false,
      ragResultCount: 0,
      ragAvgScore: null,
      ragFallbackReason: "no_insight_found",
    });
    expect(meta.ragAvgScore).toBeNull();
  });
});
