/**
 * Enqueues 1 representative city per RAG_ISO2 country (~26 cities) into
 * the real `insight-scraper` BullMQ queue, for building the RAG eval
 * corpus (`.claude/plans/1-rag-eval-eventual-hickey.md` Phase 0.4).
 *
 * Deliberately does NOT call `scheduleInsightScraping()` — that fans out
 * every city in every supported country (~283 cities across the 26
 * RAG_ISO2 countries, per `extended-cities.json` +
 * `extended-cities.rag-pack.json`), which is far more Serper/Gemini spend
 * than the eval corpus needs. `selectEvalCorpusCities()` picks exactly one
 * (the first/capital-first) city per country instead.
 *
 * Idempotent/resumable: skips any city that already has PlaceInsight docs
 * (see `excludeAlreadyScraped()`) — a real incident (2026-08-22) exhausted
 * the day's Gemini quota partway through a run, and because scrape jobs use
 * removeOnComplete:true, the only way to know a city already succeeded is
 * to check PlaceInsight itself, not the queue.
 *
 * This only enqueues jobs — it does NOT scrape anything itself. Run
 * `npm run worker --workspace=backend` (or ensure it's already running)
 * to actually drain the queue; the worker's built-in rate limiter
 * (1 job / 2s, see `insight-worker.ts`) paces the real Serper + Gemini
 * calls, so ~26 jobs takes a few minutes, not a few seconds.
 *
 * Prerequisites: `npm run seed:destinations --workspace=backend` first
 * (Country must be populated), SERPER_API_KEY + GEMINI_API_KEY set,
 * Mongo + Redis reachable.
 *
 * Run: npm run seed:eval-corpus --workspace=backend
 */
import path from "path";
import * as dotenv from "dotenv";
import mongoose from "mongoose";
import { buildAllCountrySeedPayloads } from "../src/features/destinations/services/world-destinations.builder";
import {
  selectEvalCorpusCities,
  excludeAlreadyScraped,
} from "../src/features/destinations/services/eval-corpus-selection";
import { enqueueCityScrapes } from "../src/features/destinations/jobs/insight-queue";
import { PlaceInsight } from "../src/features/destinations/models/PlaceInsight";

dotenv.config();

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
  }
  if (!process.env.SERPER_API_KEY) {
    console.error(
      "SERPER_API_KEY is not set — every scrape job will fail with 0 entities.",
    );
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to Mongo.");

  const seedDataDir = path.join(process.cwd(), "scripts", "seed-data");
  const payloads = buildAllCountrySeedPayloads(seedDataDir);
  const allTargets = selectEvalCorpusCities(payloads);

  const alreadyScraped = await PlaceInsight.distinct("cityIdKey");
  const targets = excludeAlreadyScraped(allTargets, alreadyScraped);
  const skipped = allTargets.length - targets.length;

  console.log(
    `Selected ${allTargets.length} representative cities` +
      (skipped > 0 ? ` (${skipped} already have data, skipping):` : ":"),
  );
  for (const t of targets) {
    console.log(`  ${t.countryIdKey.toUpperCase()} — ${t.cityNameEn}`);
  }

  if (targets.length === 0) {
    console.log("\nNothing to enqueue — every target city already has data.");
    await mongoose.disconnect();
    process.exit(0);
  }

  const jobsAdded = await enqueueCityScrapes(targets);
  console.log(
    `\nEnqueued ${jobsAdded} scrape jobs. Run the worker to process them ` +
      `(1 job / 2s rate limit — expect several minutes):\n` +
      `  npm run worker --workspace=backend`,
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
