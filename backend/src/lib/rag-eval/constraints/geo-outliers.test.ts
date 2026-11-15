import { describe, it, expect } from "vitest";
import { checkGeoOutliers, OUTLIER_THRESHOLD_KM } from "./geo-outliers";

/**
 * Proxy for "does every activity actually belong to this destination
 * city" — NOT true containment against the destination's real boundary,
 * which needs live geocoding (out of scope for a pure/offline checker).
 * Instead flags activities that are implausibly far from the trip's own
 * centroid, which is exactly the shape of the real documented bug: the
 * Mapbox fallback in validation.service.ts uses the raw AI query with no
 * destination city appended, so it can resolve to a same-named place in a
 * totally different city.
 */

const HANOI: [number, number] = [105.85, 21.03];
const HANOI_NEARBY: [number, number] = [105.84, 21.02]; // ~1.5km away
const HCMC: [number, number] = [106.7, 10.78]; // ~1150km from Hanoi

describe("checkGeoOutliers", () => {
  it("passes when every activity clusters tightly together", () => {
    const result = checkGeoOutliers({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        {
          day: 1,
          activities: [
            { name: "A", location: { coordinates: HANOI } },
            { name: "B", location: { coordinates: HANOI_NEARBY } },
          ],
        },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.metric).toBe(0);
  });

  it(`flags an activity resolved to a city >${OUTLIER_THRESHOLD_KM}km from the trip's own centroid`, () => {
    const result = checkGeoOutliers({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        {
          day: 1,
          activities: [
            { name: "A", location: { coordinates: HANOI } },
            { name: "B", location: { coordinates: HANOI_NEARBY } },
            { name: "Wrong city entirely", location: { coordinates: HCMC } },
          ],
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.metric).toBe(1);
  });

  it("ignores unresolved [0,0] activities instead of treating them as outliers (that's unresolved-places.ts's job)", () => {
    const result = checkGeoOutliers({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        {
          day: 1,
          activities: [
            { name: "A", location: { coordinates: HANOI } },
            { name: "unresolved", location: { coordinates: [0, 0] } },
          ],
        },
      ],
    });

    expect(result.pass).toBe(true);
  });

  it("passes trivially when there are no resolved activities to compare", () => {
    const result = checkGeoOutliers({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [{ day: 1, activities: [] }],
    });
    expect(result.pass).toBe(true);
    expect(result.metric).toBe(0);
  });
});
