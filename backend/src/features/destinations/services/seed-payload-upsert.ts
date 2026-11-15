/**
 * Pure builder for the bulkWrite ops that `seed-destinations.ts` runs.
 * Split out from the script so it's testable without Mongo.
 */
import type { CountrySeedPayload } from "./world-destinations.builder";

export interface ExistingCityInsight {
  idKey: string;
  insightText?: string | null;
  insightUpdatedAt?: Date | null;
}

/** country idKey -> its cities' existing insight state, read from Mongo before seeding. */
export type ExistingCountryInsights = Map<string, ExistingCityInsight[]>;

interface SeedCityDoc {
  idKey: string;
  name: string;
  nameEn: string;
  timezone: string;
  insightText: string | null;
  insightUpdatedAt: Date | null;
}

export interface CountryUpsertOp {
  updateOne: {
    filter: { idKey: string };
    update: {
      $set: {
        name: string;
        nameEn: string;
        flagEmoji?: string | undefined;
        isSupported: boolean;
        cities: SeedCityDoc[];
      };
    };
    upsert: true;
  };
}

/**
 * Upsert-by-idKey per country. The `cities` array is a full replacement
 * (Mongoose embeds cities inside Country, there's no per-element upsert),
 * so `existing` must be passed whenever this runs against a database that
 * may already have scraped RAG data — otherwise every re-seed silently
 * wipes `insightUpdatedAt` and defeats the 30-day staleness window in
 * `insight-queue.ts`, forcing every city to look "never scraped" again.
 */
export function toCountryUpsertOps(
  payloads: CountrySeedPayload[],
  existing: ExistingCountryInsights = new Map(),
): CountryUpsertOp[] {
  return payloads.map((p) => {
    const existingCities = existing.get(p.idKey) ?? [];
    const existingByIdKey = new Map(existingCities.map((c) => [c.idKey, c]));

    const cities: SeedCityDoc[] = p.cities.map((c) => {
      const prior = existingByIdKey.get(c.idKey);
      return {
        idKey: c.idKey,
        name: c.name,
        nameEn: c.nameEn,
        timezone: c.timezone,
        insightText: prior?.insightText ?? null,
        insightUpdatedAt: prior?.insightUpdatedAt ?? null,
      };
    });

    return {
      updateOne: {
        filter: { idKey: p.idKey },
        update: {
          $set: {
            name: p.name,
            nameEn: p.nameEn,
            flagEmoji: p.flagEmoji,
            isSupported: p.isSupported,
            cities,
          },
        },
        upsert: true,
      },
    };
  });
}
