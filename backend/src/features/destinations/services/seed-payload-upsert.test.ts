import { describe, it, expect } from "vitest";
import {
  toCountryUpsertOps,
  type ExistingCountryInsights,
} from "./seed-payload-upsert";
import type { CountrySeedPayload } from "./world-destinations.builder";

const vnPayload: CountrySeedPayload = {
  idKey: "vn",
  name: "Việt Nam",
  nameEn: "Vietnam",
  flagEmoji: "🇻🇳",
  isSupported: true,
  cities: [
    {
      idKey: "hanoi",
      name: "Hà Nội",
      nameEn: "Hanoi",
      timezone: "Asia/Ho_Chi_Minh",
    },
  ],
};

describe("toCountryUpsertOps", () => {
  it("builds one upsert-by-idKey bulkWrite op per country payload", () => {
    const ops = toCountryUpsertOps([vnPayload]);

    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      updateOne: {
        filter: { idKey: "vn" },
        update: {
          $set: {
            name: "Việt Nam",
            nameEn: "Vietnam",
            flagEmoji: "🇻🇳",
            isSupported: true,
            cities: [
              {
                idKey: "hanoi",
                name: "Hà Nội",
                nameEn: "Hanoi",
                timezone: "Asia/Ho_Chi_Minh",
                insightText: null,
                insightUpdatedAt: null,
              },
            ],
          },
        },
        upsert: true,
      },
    });
  });

  it("preserves an existing city's insightText/insightUpdatedAt across a re-seed instead of wiping them", () => {
    // Re-running the seed script (e.g. after adding a new city to
    // extended-cities.json) used to $set the whole `cities` array with
    // fresh objects that never carried insightText/insightUpdatedAt —
    // silently erasing the scraper's work and the 30-day staleness
    // tracking (insight-queue.test.ts) every time the seed script ran.
    const scrapedAt = new Date("2026-08-01T00:00:00Z");
    const existing: ExistingCountryInsights = new Map([
      [
        "vn",
        [{ idKey: "hanoi", insightText: null, insightUpdatedAt: scrapedAt }],
      ],
    ]);

    const ops = toCountryUpsertOps([vnPayload], existing);
    const city = (
      ops[0] as {
        updateOne: {
          update: {
            $set: {
              cities: { idKey: string; insightUpdatedAt: Date | null }[];
            };
          };
        };
      }
    ).updateOne.update.$set.cities[0]!;

    expect(city.insightUpdatedAt).toEqual(scrapedAt);
  });

  it("defaults insightText/insightUpdatedAt to null for a city with no prior scrape record", () => {
    const ops = toCountryUpsertOps([vnPayload], new Map());
    const city = (
      ops[0] as {
        updateOne: {
          update: {
            $set: {
              cities: {
                idKey: string;
                insightText: unknown;
                insightUpdatedAt: unknown;
              }[];
            };
          };
        };
      }
    ).updateOne.update.$set.cities[0]!;

    expect(city.insightText).toBeNull();
    expect(city.insightUpdatedAt).toBeNull();
  });

  it("returns an empty array for an empty payload list", () => {
    expect(toCountryUpsertOps([])).toEqual([]);
  });
});
