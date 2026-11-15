import { describe, it, expect } from "vitest";
import { checkIntraDayTravel } from "./intra-day-travel";

/**
 * Deliberately does NOT recompute distances — itinerary-builder.ts already
 * writes requiresTransport/distanceFromPrevious per activity at generation
 * time (via geo-validator.service.ts's THRESHOLDS_KM). This check just
 * makes that pre-computed signal visible in aggregate instead of only
 * ever surfacing as an advisory UI badge nothing enforces.
 */

describe("checkIntraDayTravel", () => {
  it("passes when no activity is flagged requiresTransport", () => {
    const result = checkIntraDayTravel({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        {
          day: 1,
          activities: [
            { name: "A" },
            { name: "B", distanceFromPrevious: 0.8, requiresTransport: false },
          ],
        },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.metric).toBe(0);
  });

  it("fails and reports the rate when an activity is flagged requiresTransport", () => {
    const result = checkIntraDayTravel({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        {
          day: 1,
          activities: [
            { name: "A" },
            { name: "B", distanceFromPrevious: 12, requiresTransport: true },
          ],
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.metric).toBe(1); // 1 of 1 measured gap flagged
  });

  it("only counts activities that actually carry a distanceFromPrevious (first-of-day activities never do)", () => {
    const result = checkIntraDayTravel({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        { day: 1, activities: [{ name: "first activity, no prior" }] },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.metric).toBe(0);
  });
});
