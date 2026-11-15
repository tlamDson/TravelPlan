import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", () => ({ default: { post } }));
vi.mock("../../../config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../config/env")>();
  return {
    ...actual,
    env: { ...actual.env, GOOGLE_PLACES_API_KEY: "test-key" },
  };
});
vi.mock("./place-photo.service", () => ({
  resolveBestPhotoUrl: vi.fn().mockResolvedValue(undefined),
}));

import { PlacesService } from "./places.service";
import { resolveDayHours } from "./opening-hours";

const openAllDay = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../test/fixtures/places-opening-hours-24h.json"),
    "utf8",
  ),
) as { places: Record<string, unknown>[] };

const PERIODS = [
  {
    open: { day: 1, hour: 8, minute: 0 },
    close: { day: 1, hour: 17, minute: 0 },
  },
];

function googleResponse(currentOpeningHours?: unknown) {
  return {
    data: {
      places: [
        {
          id: "p1",
          displayName: { text: "Pagoda" },
          location: { latitude: 21.03, longitude: 105.85 },
          types: ["tourist_attraction"],
          ...(currentOpeningHours ? { currentOpeningHours } : {}),
        },
      ],
    },
  };
}

beforeEach(() => post.mockReset());

describe("PlacesService.searchByText — structured opening periods", () => {
  it("maps currentOpeningHours.periods to openingPeriods alongside the weekday text", async () => {
    post.mockResolvedValue(
      googleResponse({
        openNow: true,
        weekdayDescriptions: ["Monday: 8:00 AM – 5:00 PM"],
        periods: PERIODS,
      }),
    );
    const details = await new PlacesService().searchByText("Pagoda, Hanoi");
    expect(details?.openingPeriods).toEqual(PERIODS);
    expect(details?.openingHoursArray).toEqual(["Monday: 8:00 AM – 5:00 PM"]);
  });

  it("leaves openingPeriods undefined when Google sends no periods", async () => {
    post.mockResolvedValue(
      googleResponse({ weekdayDescriptions: ["Monday: Closed"] }),
    );
    const details = await new PlacesService().searchByText("Pagoda, Hanoi");
    expect(details?.openingPeriods).toBeUndefined();
  });
});

describe("PlacesService.searchByText — always-open place (fixture response)", () => {
  it("requests regularOpeningHours in the field mask", async () => {
    post.mockResolvedValue({ data: openAllDay });
    await new PlacesService().searchByText("Market, HCMC");
    const headers = post.mock.calls[0]?.[2]?.headers as Record<string, string>;
    expect(headers["X-Goog-FieldMask"]).toContain("places.regularOpeningHours");
  });

  it("takes periods from regularOpeningHours, not the truncated 7-day currentOpeningHours", async () => {
    post.mockResolvedValue({ data: openAllDay });
    const details = await new PlacesService().searchByText("Market, HCMC");
    expect(details?.openingPeriods).toEqual([
      { open: { day: 0, hour: 0, minute: 0 } },
    ]);
  });

  it("resolves open24h on every weekday from the mapped periods", async () => {
    post.mockResolvedValue({ data: openAllDay });
    const details = await new PlacesService().searchByText("Market, HCMC");
    for (let day = 0; day < 7; day++) {
      expect(resolveDayHours(details?.openingPeriods, day)).toEqual({
        kind: "open24h",
      });
    }
  });

  it("falls back to currentOpeningHours periods (zero fields omitted) and still resolves open24h every day", async () => {
    const place = { ...openAllDay.places[0] } as Record<string, unknown>;
    delete place.regularOpeningHours;
    post.mockResolvedValue({ data: { places: [place] } });
    const details = await new PlacesService().searchByText("Market, HCMC");
    for (let day = 0; day < 7; day++) {
      expect(resolveDayHours(details?.openingPeriods, day)).toEqual({
        kind: "open24h",
      });
    }
  });
});
