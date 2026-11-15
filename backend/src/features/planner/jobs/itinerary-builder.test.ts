import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TripPreferences } from "@travelplan/shared";
import type { TripIntents } from "../services/intent-parser.service";
import type { ValidatedPlace } from "../services/validation.service";

vi.mock("../services/nearby-food.service", () => ({
  nearbyFoodService: { getNearbyFood: vi.fn().mockResolvedValue([]) },
}));

import {
  buildTaggedPlaces,
  clusterByProximity,
  buildItinerary,
  getProgressPercent,
  type TaggedPlace,
} from "./itinerary-builder";

function place(
  overrides: Partial<ValidatedPlace> & { name: string },
): ValidatedPlace {
  return {
    coordinates: [0, 0],
    confidence: 0.9,
    source: "google",
    ...overrides,
  };
}

const HANOI_A = place({ name: "Hanoi A", coordinates: [105.85, 21.03] });
const HANOI_B = place({ name: "Hanoi B", coordinates: [105.84, 21.02] });
const DANANG_A = place({ name: "Da Nang A", coordinates: [108.22, 16.05] });
const DANANG_B = place({ name: "Da Nang B", coordinates: [108.21, 16.06] });

describe("buildTaggedPlaces", () => {
  it("maps validated[i] to the correct (day, slot) pair in intent order", () => {
    const intents: TripIntents = {
      day1: { breakfast: "Q1", lunch: "Q2", dinner: "Q3" },
    };
    const validated = [
      place({ name: "Breakfast place" }),
      place({ name: "Lunch place" }),
      place({ name: "Dinner place" }),
    ];
    const tagged = buildTaggedPlaces(intents, validated);
    expect(tagged.map((t) => [t.slotType, t.place.name])).toEqual([
      ["breakfast", "Breakfast place"],
      ["lunch", "Lunch place"],
      ["dinner", "Dinner place"],
    ]);
  });

  it("skips a hole in the middle of a day's slots without misaligning later slots", () => {
    const intents: TripIntents = {
      // no lunch — validated only has 2 entries (breakfast, dinner)
      day1: { breakfast: "Q1", dinner: "Q2" },
    };
    const validated = [
      place({ name: "Breakfast place" }),
      place({ name: "Dinner place" }),
    ];
    const tagged = buildTaggedPlaces(intents, validated);
    expect(tagged.map((t) => t.slotType)).toEqual(["breakfast", "dinner"]);
    expect(tagged.map((t) => t.place.name)).toEqual([
      "Breakfast place",
      "Dinner place",
    ]);
  });

  it("does not crash when validated is shorter than the intent count (deficit)", () => {
    const intents: TripIntents = {
      day1: { breakfast: "Q1", lunch: "Q2", dinner: "Q3" },
    };
    const validated = [place({ name: "Only one place" })];
    const tagged = buildTaggedPlaces(intents, validated);
    expect(tagged).toHaveLength(1);
    expect(tagged[0]?.slotType).toBe("breakfast");
  });

  it("walks multiple days in sorted day-key order", () => {
    const intents: TripIntents = {
      day2: { morning: "Q2" },
      day1: { morning: "Q1" },
    };
    const validated = [
      place({ name: "Day 1 place" }),
      place({ name: "Day 2 place" }),
    ];
    const tagged = buildTaggedPlaces(intents, validated);
    expect(tagged.map((t) => t.place.name)).toEqual([
      "Day 1 place",
      "Day 2 place",
    ]);
  });

  it("walks day-key order numerically across the day9/day10 boundary", () => {
    // Object.keys(...).sort() alone is lexicographic ("day10" < "day2" as
    // strings), which would desync validated[idx] from the wrong (day, slot)
    // pair for any trip of 10+ days. buildTaggedPlaces must iterate in
    // exactly the same numeric order flattenIntents produces.
    //
    // Each day uses a distinct slot type so the bug is actually observable:
    // buildTaggedPlaces always pushes validated[idx] in strict incrementing
    // order regardless of which day triggered the push, so a same-named
    // validated place per day would trivially "pass" either way — the
    // slotType each place ends up paired with is what reveals a real
    // misattribution.
    const intents: TripIntents = {
      day10: { dinner: "Q10" },
      day2: { breakfast: "Q2" },
      day9: { lunch: "Q9" },
    };
    const validated = [
      place({ name: "Day 2 place" }),
      place({ name: "Day 9 place" }),
      place({ name: "Day 10 place" }),
    ];
    const tagged = buildTaggedPlaces(intents, validated);
    expect(tagged.map((t) => [t.slotType, t.place.name])).toEqual([
      ["breakfast", "Day 2 place"],
      ["lunch", "Day 9 place"],
      ["dinner", "Day 10 place"],
    ]);
  });
});

describe("clusterByProximity", () => {
  function tag(
    p: ValidatedPlace,
    slotType: string,
    slotOrder: number,
  ): TaggedPlace {
    return { place: p, slotType, slotOrder };
  }

  it("groups places by geographic proximity, not input order, with no cross-day duplicates", () => {
    // Interleaved input order deliberately does not match the expected
    // Hanoi/Da Nang geographic grouping.
    const tagged = [
      tag(HANOI_A, "morning", 1),
      tag(DANANG_A, "morning", 1),
      tag(HANOI_B, "afternoon", 4),
      tag(DANANG_B, "afternoon", 4),
    ];

    const clusters = clusterByProximity(tagged, 2, 2);

    expect(clusters).toHaveLength(2);
    const namesByCluster = clusters.map((c) =>
      c.map((t) => t.place.name).sort(),
    );
    expect(namesByCluster).toContainEqual(["Hanoi A", "Hanoi B"]);
    expect(namesByCluster).toContainEqual(["Da Nang A", "Da Nang B"]);

    // No place appears in more than one day.
    const allNames = clusters.flatMap((c) => c.map((t) => t.place.name));
    expect(new Set(allNames).size).toBe(allNames.length);
  });

  it("sorts each cluster by slotOrder after geographic grouping", () => {
    const tagged = [
      tag(HANOI_A, "afternoon", 4), // deliberately out of slot order
      tag(HANOI_B, "morning", 1),
    ];
    const clusters = clusterByProximity(tagged, 1, 2);
    expect(clusters[0]?.map((t) => t.slotType)).toEqual([
      "morning",
      "afternoon",
    ]);
  });

  it("falls back to naive chunking when no place has real coordinates", () => {
    const zero = (name: string) => place({ name, coordinates: [0, 0] });
    const tagged = [
      tag(zero("A"), "morning", 1),
      tag(zero("B"), "afternoon", 4),
      tag(zero("C"), "morning", 1),
      tag(zero("D"), "afternoon", 4),
    ];
    const clusters = clusterByProximity(tagged, 2, 2);
    expect(clusters[0]?.map((t) => t.place.name)).toEqual(["A", "B"]);
    expect(clusters[1]?.map((t) => t.place.name)).toEqual(["C", "D"]);
  });

  it("backfills short clusters with [0,0] passthrough places without mixing them into distance calc", () => {
    const zero = (name: string) => place({ name, coordinates: [0, 0] });
    const tagged = [
      tag(HANOI_A, "morning", 1),
      tag(DANANG_A, "morning", 1),
      tag(zero("Passthrough 1"), "afternoon", 4),
      tag(zero("Passthrough 2"), "afternoon", 4),
    ];
    const clusters = clusterByProximity(tagged, 2, 2);
    expect(clusters).toHaveLength(2);
    for (const cluster of clusters) {
      expect(cluster).toHaveLength(2);
      const hasRealCoordPlace = cluster.some(
        (t) => t.place.coordinates[0] !== 0 || t.place.coordinates[1] !== 0,
      );
      const hasPassthrough = cluster.some(
        (t) => t.place.coordinates[0] === 0 && t.place.coordinates[1] === 0,
      );
      expect(hasRealCoordPlace).toBe(true);
      expect(hasPassthrough).toBe(true);
    }
  });

  it("returns numDays empty arrays for empty input", () => {
    const clusters = clusterByProximity([], 3, 2);
    expect(clusters).toEqual([[], [], []]);
  });
});

describe("getProgressPercent", () => {
  it("returns the number directly", () => {
    expect(getProgressPercent(42)).toBe(42);
  });

  it("returns percent from an object payload", () => {
    expect(getProgressPercent({ percent: 55 })).toBe(55);
  });

  it("returns 0 for an unrecognized shape", () => {
    expect(getProgressPercent(null)).toBe(0);
    expect(getProgressPercent("50")).toBe(0);
    expect(getProgressPercent({})).toBe(0);
  });
});

function basePreferences(
  overrides: Partial<TripPreferences> = {},
): TripPreferences {
  return {
    destination: "Hanoi, Vietnam",
    startDate: "2026-06-01T00:00:00.000Z",
    endDate: "2026-06-01T00:00:00.000Z",
    budget: { total: 1000, currency: "USD" },
    travelers: { adults: 1, children: 0 },
    pace: "balanced",
    focus: [],
    constraints: {
      mobility_friendly: false,
      avoid_crowds: false,
      start_late: false,
      indoor_only: false,
      no_street_food: false,
      no_late_nights: false,
      foodAsMainActivities: false,
    },
    includedMeals: [],
    transportMode: "walking",
    activitiesPerDay: 3,
    accommodationType: "any",
    ...overrides,
  };
}

describe("buildItinerary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns SLOT_START_TIMES per slot and falls back to 09:00 for an unknown slot", async () => {
    const intents: TripIntents = { day1: { breakfast: "Q1", lunch: "Q2" } };
    const validated = [
      place({ name: "Breakfast place", coordinates: [105.85, 21.03] }),
      place({ name: "Lunch place", coordinates: [105.86, 21.04] }),
    ];
    const itinerary = await buildItinerary(
      intents,
      validated,
      basePreferences(),
    );
    const times = itinerary[0].activities.map((a: any) => a.time);
    expect(times).toEqual(["08:00", "12:30"]);
  });

  it("attaches notes for meal slots (breakfast/lunch/dinner)", async () => {
    const intents: TripIntents = { day1: { breakfast: "Q1", morning: "Q2" } };
    const validated = [
      place({ name: "Breakfast place", coordinates: [105.85, 21.03] }),
      place({ name: "Morning place", coordinates: [105.86, 21.04] }),
    ];
    const itinerary = await buildItinerary(
      intents,
      validated,
      basePreferences(),
    );
    const [breakfastActivity, morningActivity] = itinerary[0].activities;
    expect(breakfastActivity.notes).toBe("Breakfast");
    expect(morningActivity.notes).toBeUndefined();
  });

  it("sanitizes HTML out of place names", async () => {
    const intents: TripIntents = { day1: { morning: "Q1" } };
    const validated = [
      place({
        name: "<script>alert(1)</script>Nice Place",
        coordinates: [105.85, 21.03],
      }),
    ];
    const itinerary = await buildItinerary(
      intents,
      validated,
      basePreferences(),
    );
    expect(itinerary[0].activities[0].name).toBe("Nice Place");
  });

  it("sets distanceFromPrevious only when both consecutive activities have real coordinates", async () => {
    const intents: TripIntents = { day1: { breakfast: "Q1", lunch: "Q2" } };
    const validated = [
      place({ name: "Real coords", coordinates: [105.85, 21.03] }),
      place({ name: "Zero coords", coordinates: [0, 0] }),
    ];
    const itinerary = await buildItinerary(
      intents,
      validated,
      basePreferences(),
    );
    const [, second] = itinerary[0].activities;
    expect(second.distanceFromPrevious).toBeUndefined();
  });

  it("produces no duplicate places across days for a 2-day, 2-slot trip", async () => {
    const intents: TripIntents = {
      day1: { morning: "Q1", afternoon: "Q2" },
      day2: { morning: "Q3", afternoon: "Q4" },
    };
    const validated = [HANOI_A, DANANG_A, HANOI_B, DANANG_B];
    const itinerary = await buildItinerary(
      intents,
      validated,
      basePreferences({
        startDate: "2026-06-01T00:00:00.000Z",
        endDate: "2026-06-02T00:00:00.000Z",
      }),
    );
    const allNames = itinerary.flatMap((day: any) =>
      day.activities.map((a: any) => a.name),
    );
    expect(new Set(allNames).size).toBe(allNames.length);
  });
  it("attaches the structured opening hours for the activity's weekday (2026-06-01 is a Monday)", async () => {
    const intents: TripIntents = { day1: { morning: "Q1" } };
    const validated = [
      place({
        name: "Pagoda",
        coordinates: [105.85, 21.03],
        openingHoursArray: ["Monday: Open 24 hours"],
        openingPeriods: [
          {
            open: { day: 1, hour: 8, minute: 0 },
            close: { day: 1, hour: 17, minute: 0 },
          },
        ],
      }),
    ];
    const itinerary = await buildItinerary(
      intents,
      validated,
      basePreferences(),
    );
    expect(itinerary[0].activities[0].openingHoursDetail).toEqual({
      kind: "ranges",
      ranges: [{ open: "08:00", close: "17:00" }],
    });
  });
});
