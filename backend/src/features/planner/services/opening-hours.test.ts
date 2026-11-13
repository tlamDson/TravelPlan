import { describe, it, expect } from "vitest";
import { resolveDayHours, type OpeningPeriod } from "./opening-hours";

const p = (
  openDay: number,
  openH: number,
  openM: number,
  closeDay: number,
  closeH: number,
  closeM: number,
): OpeningPeriod => ({
  open: { day: openDay, hour: openH, minute: openM },
  close: { day: closeDay, hour: closeH, minute: closeM },
});

describe("resolveDayHours", () => {
  it("returns open24h for the single open-only period Google sends for always-open places", () => {
    const periods: OpeningPeriod[] = [{ open: { day: 0, hour: 0, minute: 0 } }];
    expect(resolveDayHours(periods, 3)).toEqual({ kind: "open24h" });
  });

  it("returns language-neutral HH:MM ranges for the requested day, sorted by opening time", () => {
    const periods = [
      p(1, 17, 0, 1, 22, 30),
      p(1, 8, 0, 1, 12, 0),
      p(2, 9, 0, 2, 17, 0),
    ];
    expect(resolveDayHours(periods, 1)).toEqual({
      kind: "ranges",
      ranges: [
        { open: "08:00", close: "12:00" },
        { open: "17:00", close: "22:30" },
      ],
    });
  });

  it("keeps an overnight period on the day it opens", () => {
    expect(resolveDayHours([p(5, 18, 0, 6, 2, 0)], 5)).toEqual({
      kind: "ranges",
      ranges: [{ open: "18:00", close: "02:00" }],
    });
  });

  it("returns closed when no period opens on that day", () => {
    expect(resolveDayHours([p(2, 9, 0, 2, 17, 0)], 0)).toEqual({
      kind: "closed",
    });
  });

  it("returns undefined when periods are missing or empty (unknown, not closed)", () => {
    expect(resolveDayHours(undefined, 1)).toBeUndefined();
    expect(resolveDayHours([], 1)).toBeUndefined();
  });
});
