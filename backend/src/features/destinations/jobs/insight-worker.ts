/**
 * Insight Scraper Worker
 *
 * Processes a single city per job.
 * Fetches entities from multiple themes, generates embeddings,
 * and upserts into PlaceInsight collection via bulkWrite.
 */

import { Job } from "bullmq";
import { extractCityEntities } from "../services/insight-scraper.service";
import { embedTexts } from "../services/embedding.service";
import { PlaceInsight } from "../models/PlaceInsight";
import { Country } from "../models/Country";
import { createWorker } from "../../../lib/queue";
import { QUEUE_NAMES } from "../../../lib/queue-defaults";
import { workerLogger as logger } from "../../../lib/logger";
import type { ScrapeCityPayload } from "./insight-queue";

export async function insightScraperProcessor(
  job: Job<ScrapeCityPayload>,
): Promise<string> {
  const { countryIdKey, countryNameEn, cityIdKey, cityNameEn } = job.data;

  logger.info(
    { jobId: job.id, city: cityNameEn, country: countryNameEn },
    "Processing PlaceInsight extraction job",
  );

  const entities = await extractCityEntities(cityNameEn, countryNameEn);

  if (entities.length === 0) {
    throw new Error(
      `Serper/Gemini returned no entities for ${cityNameEn}, ${countryNameEn}`,
    );
  }

  // Batch embed texts
  const textsToEmbed = entities.map(
    (e) => `${e.name} ${e.description} ${e.tags.join(" ")}`,
  );

  const embeddings = await embedTexts(textsToEmbed);

  // Bulk write to PlaceInsight collection with updateOne + upsert
  const operations = entities.map((entity, i) => ({
    updateOne: {
      filter: { cityIdKey, name: entity.name },
      update: {
        $set: {
          countryIdKey,
          category: entity.category,
          description: entity.description,
          tags: entity.tags,
          embedding: embeddings[i]!,
          sourceQuery: entity.sourceQuery,
          updatedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  await PlaceInsight.bulkWrite(operations);

  // Update last scraped timestamp to prevent infinite re-queueing
  await Country.updateOne(
    { idKey: countryIdKey, "cities.idKey": cityIdKey },
    {
      $set: {
        "cities.$.insightUpdatedAt": new Date(),
      },
    },
  );

  logger.info(
    { jobId: job.id, city: cityNameEn, totalProcessed: entities.length },
    "PlaceInsight entities extracted and bulk upserted",
  );

  return `Done: ${cityNameEn} (${entities.length} places)`;
}

// Worker with rate limiter: max 1 job processed every 2 seconds
// This protects Serper and Gemini API rate limits.
//
// No custom lockDuration/stalledInterval — see the comment above
// startWorker() in worker.ts for why: this was a copy of the same
// `{ stalledInterval: 30_000, lockDuration: 60_000 }` that measurement
// (see B3, worker-lock-duration.integration.test.ts) showed was a no-op
// plus pure downside. insightScraperProcessor is `await`-only (Serper +
// Gemini HTTP calls), same shape as trip-generation's processor.
export const insightWorker = createWorker(
  QUEUE_NAMES.INSIGHT_SCRAPER,
  insightScraperProcessor,
  {
    limiter: { max: 1, duration: 2000 },
  },
);
