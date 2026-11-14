import { describe, it, expect, vi, beforeEach } from "vitest";

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
