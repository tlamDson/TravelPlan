import { describe, it, expect } from "vitest";
import { slicePreferences, rebaseDays } from "./chunk-helpers";
import type { TripPreferences } from "@travelplan/shared";

describe("slicePreferences", () => {
  it("shifts startDate/endDate forward by dayOffset, spanning chunkDays days", () => {
    const preferences = { destination: "Hanoi" } as TripPreferences & {
      startDate: string;
    };
    (preferences as { startDate: string }).startDate = "2026-09-10";

    const sliced = slicePreferences(preferences, 3, 3);

    expect(sliced.startDate).toBe("2026-09-13");
    expect(sliced.endDate).toBe("2026-09-15"); // 3 days inclusive: 13,14,15
  });

  it("preserves every other preference field unchanged", () => {
    const preferences = {
      destination: "Hanoi",
      startDate: "2026-09-10",
      focus: ["Culture"],
    } as unknown as TripPreferences;

    const sliced = slicePreferences(preferences, 0, 3);

    expect(sliced.destination).toBe("Hanoi");
    expect(sliced.focus).toEqual(["Culture"]);
  });
});

describe("rebaseDays", () => {
  it("shifts day numbers by dayOffset (chunk day 1 -> absolute day dayOffset+1)", () => {
    const days = [
      { day: 1, date: new Date("2026-01-01"), activities: [] },
      { day: 2, date: new Date("2026-01-02"), activities: [] },
    ];

    const rebased = rebaseDays(days, 3, new Date("2026-09-10"));

    expect(rebased[0]!.day).toBe(4); // chunk day 1 -> trip day 4
    expect(rebased[1]!.day).toBe(5);
  });

  it("computes absolute dates from the trip startDate, not the chunk's own dates", () => {
    const days = [{ day: 1, date: new Date("wrong"), activities: [] }];

    const rebased = rebaseDays(days, 3, new Date("2026-09-10T00:00:00.000Z"));

    expect(rebased[0]!.date.toISOString().slice(0, 10)).toBe("2026-09-13");
  });
});
