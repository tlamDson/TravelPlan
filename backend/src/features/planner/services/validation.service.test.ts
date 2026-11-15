import { describe, it, expect, vi, beforeEach } from "vitest";

const findByQuery = vi.fn();
const upsert = vi.fn();
const create = vi.fn();

vi.mock("../repositories/place-cache.repository", () => ({
  placeCacheRepository: {
    findByQuery: (...args: unknown[]) => findByQuery(...args),
    upsert: (...args: unknown[]) => upsert(...args),
    create: (...args: unknown[]) => create(...args),
  },
}));

const placesFire = vi.fn();
const mapboxFire = vi.fn();

vi.mock("../tools/circuit-breaker", () => ({
  placesTextBreaker: { fire: (...args: unknown[]) => placesFire(...args) },
  mapboxBreaker: { fire: (...args: unknown[]) => mapboxFire(...args) },
}));

import { validationService } from "./validation.service";

const GOOGLE_PLACE = {
  placeId: "p1",
  name: "Old Quarter",
  location: { lat: 21.03, lng: 105.85 },
  rating: 4.5,
  reviewCount: 100,
  categories: ["tourist_attraction"],
  photoUrl: "https://cdn.example.com/old-quarter.jpg",
  openingHoursArray: ["Monday: 9:00 AM – 5:00 PM"],
  openingPeriods: [
    { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
  ],
};

beforeEach(() => {
  findByQuery.mockReset().mockResolvedValue(null);
  upsert.mockReset().mockResolvedValue({});
  create.mockReset().mockResolvedValue({});
  placesFire.mockReset().mockResolvedValue(GOOGLE_PLACE);
  mapboxFire.mockReset().mockResolvedValue(null);
});

describe("validationService.validateIntent — cache key includes destination", () => {
  it("uses different cache keys for the same intent in different destinations", async () => {
    await validationService.validateIntent("Old Quarter", "Hanoi, Vietnam");
    await validationService.validateIntent("Old Quarter", "Prague, Czechia");

    const readKeys = findByQuery.mock.calls.map((c) => c[0]);
    expect(readKeys[0]).not.toBe(readKeys[1]);
    expect(readKeys[0]).toContain("Hanoi");
    expect(readKeys[1]).toContain("Prague");

    // The write key must match the read key so a later lookup for the same
    // (intent, destination) pair actually hits what this call wrote.
    const writeKeys = upsert.mock.calls.map((c) => c[0]);
    expect(writeKeys[0]).toBe(readKeys[0]);
    expect(writeKeys[1]).toBe(readKeys[1]);
  });

  it("matches the cache key to the query actually sent to Google (geo-constrained)", async () => {
    await validationService.validateIntent("Old Quarter", "Hanoi, Vietnam");

    expect(placesFire).toHaveBeenCalledWith("Old Quarter, Hanoi");
    expect(findByQuery).toHaveBeenCalledWith("Old Quarter, Hanoi");
  });
});

describe("validationService.validateIntent — cache hit restores all rendered fields", () => {
  it("returns photoUrl and openingHoursArray from a cache hit, not just rating/price", async () => {
    findByQuery.mockResolvedValue({
      _id: { toString: () => "cache-id-1" },
      placeName: "Old Quarter",
      placeType: "tourist_attraction",
      coordinates: { coordinates: [105.85, 21.03] },
      confidence: 0.95,
      photoUrl: "https://cdn.example.com/old-quarter.jpg",
      openingHoursArray: ["Monday: 9:00 AM – 5:00 PM"],
      openingPeriods: GOOGLE_PLACE.openingPeriods,
      rating: 4.5,
    });

    const result = await validationService.validateIntent(
      "Old Quarter",
      "Hanoi, Vietnam",
    );

    expect(result?.source).toBe("cache");
    expect(result?.photoUrl).toBe("https://cdn.example.com/old-quarter.jpg");
    expect(result?.openingHoursArray).toEqual(["Monday: 9:00 AM – 5:00 PM"]);
    expect(result?.openingPeriods).toEqual(GOOGLE_PLACE.openingPeriods);
  });
});

describe("validationService.validateIntent — writes photoUrl/openingHoursArray on a fresh Google match", () => {
  it("includes photoUrl and openingHoursArray in the cached document", async () => {
    await validationService.validateIntent("Old Quarter", "Hanoi, Vietnam");

    expect(upsert).toHaveBeenCalledTimes(1);
    const cacheData = upsert.mock.calls[0]?.[1];
    expect(cacheData.photoUrl).toBe("https://cdn.example.com/old-quarter.jpg");
    expect(cacheData.openingHoursArray).toEqual(["Monday: 9:00 AM – 5:00 PM"]);
    expect(cacheData.openingPeriods).toEqual(GOOGLE_PLACE.openingPeriods);
  });

  it("returns openingPeriods on the result of a fresh Google match", async () => {
    const result = await validationService.validateIntent(
      "Old Quarter",
      "Hanoi, Vietnam",
    );
    expect(result?.openingPeriods).toEqual(GOOGLE_PLACE.openingPeriods);
  });
});

describe("validationService.validateBatch — no duplicate cache documents", () => {
  it("upserts instead of creating, so two identical intents in one batch don't race into duplicate docs", async () => {
    await validationService.validateBatch(
      ["Old Quarter", "Old Quarter"],
      "Hanoi, Vietnam",
    );

    expect(create).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]?.[0]).toBe(upsert.mock.calls[1]?.[0]);
  });
});
