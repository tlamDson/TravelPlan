import { describe, it, expect } from "vitest";
import { checkNoDuplicates } from "./duplicates";

/**
 * Mirrors trip.processor.ts's dedupeValidatedPlaces() dedupe rules (name,
 * googlePlaceId, or <=0.1km) — but applied here as a checker across the
 * *final* itinerary, which is what actually catches the documented gap:
 * the Pro-chunked generation path skips dedupe entirely, so duplicates
 * across chunk boundaries only ever show up in the finished trip.
 */

describe("checkNoDuplicates", () => {
  it("passes when every activity name is unique", () => {
    const result = checkNoDuplicates({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        { day: 1, activities: [{ name: "Old Quarter" }] },
        { day: 2, activities: [{ name: "Train Street" }] },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.metric).toBe(0);
  });

  it("flags a case-insensitive name repeated across days (chunk-boundary duplicate)", () => {
    const result = checkNoDuplicates({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        { day: 1, activities: [{ name: "Old Quarter" }] },
        { day: 2, activities: [{ name: "  old quarter  " }] },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.metric).toBe(1);
  });

  it("flags a repeated googlePlaceId even when names differ", () => {
    const result = checkNoDuplicates({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        {
          day: 1,
          activities: [
            { name: "Old Quarter", location: { googlePlaceId: "ChIJabc" } },
          ],
        },
        {
          day: 2,
          activities: [
            {
              name: "Hanoi Old Quarter (again)",
              location: { googlePlaceId: "ChIJabc" },
            },
          ],
        },
      ],
    });

    expect(result.pass).toBe(false);
  });

  it("flags two activities within 100m of each other as the same place", () => {
    const result = checkNoDuplicates({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        {
          day: 1,
          activities: [
            { name: "Cafe A", location: { coordinates: [105.85, 21.03] } },
          ],
        },
        {
          day: 2,
          activities: [
            {
              name: "Cafe B (different name, same spot)",
              location: { coordinates: [105.8501, 21.0301] },
            },
          ],
        },
      ],
    });

    expect(result.pass).toBe(false);
  });

  it("does not flag [0,0] unresolved activities as duplicates of each other by coordinate", () => {
    const result = checkNoDuplicates({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      itinerary: [
        {
          day: 1,
          activities: [
            { name: "raw query 1", location: { coordinates: [0, 0] } },
          ],
        },
        {
          day: 2,
          activities: [
            { name: "raw query 2", location: { coordinates: [0, 0] } },
          ],
        },
      ],
    });

    expect(result.pass).toBe(true);
  });
});
