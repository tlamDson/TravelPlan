import { describe, it, expect } from "vitest";
import {
  parseOpeningPeriods,
  resolveDayHours,
  type OpeningPeriod,
} from "./opening-hours";

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

describe("resolveDayHours — 24h encodings beyond the single open-only period", () => {
  it("returns open24h when a day is covered by a midnight-to-midnight period", () => {
    const periods = [0, 1, 2, 3, 4, 5, 6].map((d) =>
      p(d, 0, 0, (d + 1) % 7, 0, 0),
    );
    for (let day = 0; day < 7; day++) {
      expect(resolveDayHours(periods, day)).toEqual({ kind: "open24h" });
    }
  });

  it("returns open24h on every day covered by one multi-day span (7-day truncated window)", () => {
    const periods = [p(5, 0, 0, 4, 23, 59)];
    for (let day = 0; day < 7; day++) {
      expect(resolveDayHours(periods, day)).toEqual({ kind: "open24h" });
    }
  });

  it("returns open24h for a day fully inside a span that opens on an earlier day", () => {
    // Opens Friday 18:00, closes Monday 02:00: Saturday and Sunday are all-day.
    const periods = [p(5, 18, 0, 1, 2, 0)];
    expect(resolveDayHours(periods, 6)).toEqual({ kind: "open24h" });
    expect(resolveDayHours(periods, 0)).toEqual({ kind: "open24h" });
    expect(resolveDayHours(periods, 5)).toEqual({
      kind: "ranges",
      ranges: [{ open: "18:00", close: "02:00" }],
    });
  });
});

describe("parseOpeningPeriods", () => {
  it("fills fields that proto3 JSON omits when they are zero", () => {
    expect(
      parseOpeningPeriods([
        { open: {} },
        { open: { day: 1, hour: 9 }, close: { day: 1, hour: 17, minute: 30 } },
      ]),
    ).toEqual([
      { open: { day: 0, hour: 0, minute: 0 } },
      {
        open: { day: 1, hour: 9, minute: 0 },
        close: { day: 1, hour: 17, minute: 30 },
      },
    ]);
  });

  it("returns undefined for a malformed payload instead of throwing", () => {
    expect(parseOpeningPeriods("nope")).toBeUndefined();
    expect(parseOpeningPeriods([{ open: { day: 9 } }])).toBeUndefined();
  });
});
