import { describe, it, expect } from "vitest";
import { checkUnresolvedPlaces } from "./unresolved-places";
import type { ConstraintTrip } from "./types";

/**
 * trip.processor.ts:340-351's passthrough guard fabricates a place with
 * coordinates: [0,0] when validateBatch() resolves nothing — labeled
 * "[DEV MODE]" in its log but running unconditionally in production. The
 * trip still ends COMPLETED. This check makes that hallucination rate
 * measurable across a batch of trips instead of invisible.
 */

describe("checkUnresolvedPlaces", () => {
  it("passes when every activity has real (non [0,0]) coordinates", () => {
    const result = checkUnresolvedPlaces({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        {
          day: 1,
          activities: [
            { name: "Old Quarter", location: { coordinates: [105.85, 21.03] } },
          ],
        },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.metric).toBe(0);
  });

  it("fails and reports the rate when an activity has [0,0] coordinates (the passthrough-guard fabrication)", () => {
    const result = checkUnresolvedPlaces({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        {
          day: 1,
          activities: [
            { name: "Old Quarter", location: { coordinates: [105.85, 21.03] } },
            { name: "raw llm query string", location: { coordinates: [0, 0] } },
          ],
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.metric).toBeCloseTo(0.5); // 1 of 2 unresolved
  });

  it("treats a missing location entirely as unresolved too", () => {
    const result = checkUnresolvedPlaces({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [{ day: 1, activities: [{ name: "no location field" }] }],
    });

    expect(result.pass).toBe(false);
    expect(result.metric).toBe(1);
  });

  it("catches malformed-trip.json's activity with no location field", async () => {
    const malformed = (
      await import("../../../test/fixtures/malformed-trip.json")
    ).default;
    const result = checkUnresolvedPlaces(
      malformed as unknown as ConstraintTrip,
    );
    expect(result.pass).toBe(false);
  });

  it("passes with metric 0 for a trip with no activities at all", () => {
    const result = checkUnresolvedPlaces({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [{ day: 1, activities: [] }],
    });
    expect(result.pass).toBe(true);
    expect(result.metric).toBe(0);
  });
});
