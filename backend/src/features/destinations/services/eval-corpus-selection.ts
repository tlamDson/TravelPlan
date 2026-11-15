/**
 * Picks 1 representative city per RAG-supported country for the eval
 * corpus scrape (Phase 0.4 of the RAG eval harness). Scraping every city
 * in extended-cities.json/rag-pack.json for all 26 RAG_ISO2 countries
 * would be ~283 cities (~850 Serper + ~850 Gemini calls) — deliberately
 * scoped down to exactly one city per country to keep the seeding cost
 * small and bounded.
 */
import type { CountrySeedPayload } from "./world-destinations.builder";
import type { ScrapeCityPayload } from "../jobs/insight-queue";

export function selectEvalCorpusCities(
  payloads: CountrySeedPayload[],
): ScrapeCityPayload[] {
  const selected: ScrapeCityPayload[] = [];

  for (const country of payloads) {
    if (!country.isSupported) continue;
    const city = country.cities[0];
    if (!city) continue;

    selected.push({
      countryIdKey: country.idKey,
      countryNameEn: country.nameEn,
      cityIdKey: city.idKey,
      cityNameEn: city.nameEn,
    });
  }

  return selected;
}

/**
 * Drops targets whose cityIdKey already has scraped PlaceInsight data —
 * makes re-running the eval corpus seed idempotent and resumable.
 *
 * Real incident, 2026-08-22: a 26-city seed run exhausted the day's Gemini
 * quota partway through, with 7 cities already succeeded. Because
 * enqueueCityScrapes() uses removeOnComplete:true, those 7 don't show up
 * as "failed" jobs in the queue — the only way to know they're already
 * done is to check PlaceInsight itself, which is what this is for.
 */
export function excludeAlreadyScraped(
  targets: ScrapeCityPayload[],
  alreadyScrapedCityIdKeys: string[],
): ScrapeCityPayload[] {
  const done = new Set(alreadyScrapedCityIdKeys);
  return targets.filter((t) => !done.has(t.cityIdKey));
}
