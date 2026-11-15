import { describe, it, expect } from "vitest";
import { checkDayCount } from "./day-count";
import type { ConstraintTrip } from "./types";

// JSON-imported fixtures type coordinates as number[], not the tuple
// ConstraintTrip expects — the fixture files themselves are the real
// contract (backend/src/test/fixtures/*.json), so cast rather than loosen
// ConstraintActivity's type for every other (non-JSON-sourced) caller.
function asConstraintTrip(trip: unknown): ConstraintTrip {
  return trip as ConstraintTrip;
}

// Formula mirrors itinerary-builder.ts's own expectedDays calculation
// exactly (Math.round((end-start)/msPerDay) + 1) — this check compares the
// itinerary against the pipeline's own definition of "correct", not an
// independently invented one.

describe("checkDayCount", () => {
  it("passes when itinerary.length matches the date range", () => {
    const result = checkDayCount({
      startDate: "2026-09-10T00:00:00.000Z",
      endDate: "2026-09-12T00:00:00.000Z", // 3 days inclusive
      itinerary: [
        { day: 1, activities: [] },
        { day: 2, activities: [] },
        { day: 3, activities: [] },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.metric).toBe(0);
  });

  it("fails when itinerary has fewer days than the date range implies", () => {
    const result = checkDayCount({
      startDate: "2026-09-10T00:00:00.000Z",
      endDate: "2026-09-13T00:00:00.000Z", // 4 days
      itinerary: [{ day: 1, activities: [] }], // only 1
    });

    expect(result.pass).toBe(false);
    expect(result.metric).toBe(1 - 4);
  });

  it("flags the known malformed-trip.json fixture (endDate before startDate)", async () => {
    const malformed = (
      await import("../../../test/fixtures/malformed-trip.json")
    ).default;
    const result = checkDayCount(asConstraintTrip(malformed));
    expect(result.pass).toBe(false);
  });

  it("catches valid-trip.json's own day-count mismatch (title says '4 ngày 3 đêm', startDate/endDate span 4 days, but the fixture only carries 1 itinerary day — a minimal/abbreviated fixture, not an exhaustive one)", async () => {
    const valid = (await import("../../../test/fixtures/valid-trip.json"))
      .default;
    const result = checkDayCount(asConstraintTrip(valid));
    expect(result.pass).toBe(false);
    expect(result.metric).toBe(1 - 4);
  });
});
