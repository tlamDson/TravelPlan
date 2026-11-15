/**
 * Insight Queue — Fan-out Producer
 *
 * Creates 1 job PER CITY that needs an insight update (never per country batch).
 * This way BullMQ's limiter can safely throttle to 1 req/2s without Serper getting hit.
 */

import { createQueue } from "../../../lib/queue";
import {
  QUEUE_NAMES,
  DEFAULT_JOB_RETENTION,
} from "../../../lib/queue-defaults";
import { Country } from "../models/Country";
import { logger } from "../../../lib/logger";

export interface ScrapeCityPayload {
  countryIdKey: string;
  countryNameEn: string;
  cityIdKey: string;
  cityNameEn: string;
}

export const insightQueue = createQueue(QUEUE_NAMES.INSIGHT_SCRAPER);

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Enqueues exactly the given city payloads — no staleness check, no DB
 * lookup. Shared by `scheduleInsightScraping()` (the recurring cron path,
 * gated by staleness) and one-off scripts like
 * `scripts/seed-eval-corpus.ts` that need to target a specific, bounded
 * set of cities. Same jobId scheme as the cron path so the two can't
 * double-enqueue the same city.
 */
export async function enqueueCityScrapes(
  payloads: ScrapeCityPayload[],
): Promise<number> {
  for (const payload of payloads) {
    await insightQueue.add("scrape-city", payload, {
      jobId: `scrape-${payload.countryIdKey}-${payload.cityIdKey}`,
      attempts: 3,
      backoff: { type: "exponential" as const, delay: 5000 },
      ...DEFAULT_JOB_RETENTION,
    });
  }
  return payloads.length;
}

/**
 * Queries all supported countries and fans out 1 job per city that needs updating.
 * Triggered by node-cron or manually via the dev admin route.
 */
export async function scheduleInsightScraping(): Promise<{
  jobsAdded: number;
}> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  const countries = await Country.find({ isSupported: true });

  const due: ScrapeCityPayload[] = [];
  for (const country of countries) {
    for (const city of country.cities) {
      // NOTE: gate on insightUpdatedAt alone — no writer in the repo ever
      // sets insightText (see insight-queue.test.ts for the bug this used
      // to cause: `!city.insightText` was permanently true, so every
      // supported city was re-queued on every run regardless of staleness).
      const needsUpdate =
        !city.insightUpdatedAt ||
        new Date(city.insightUpdatedAt).getTime() < cutoff.getTime();

      if (needsUpdate) {
        due.push({
          countryIdKey: country.idKey,
          countryNameEn: country.nameEn,
          cityIdKey: city.idKey,
          cityNameEn: city.nameEn,
        });
      }
    }
  }

  const jobsAdded = await enqueueCityScrapes(due);
  logger.info({ jobsAdded }, "Insight scrape jobs queued");
  return { jobsAdded };
}
