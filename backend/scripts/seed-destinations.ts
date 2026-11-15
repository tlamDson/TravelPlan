/**
 * Seeds the `Country` collection from the code + JSON world destination
 * list (`world-destinations.builder.ts` + `scripts/seed-data/*.json`).
 *
 * This was declared as `backend/package.json`'s `seed:destinations` script
 * but the file itself was never committed — so `Country` was always empty,
 * `scheduleInsightScraping()`'s `Country.find({ isSupported: true })`
 * always returned nothing, and the RAG vector search corpus
 * (`PlaceInsight`) could never get populated. See
 * `.claude/plans/1-rag-eval-eventual-hickey.md` Phase 0.
 *
 * Idempotent: re-running this after cities have already been scraped for
 * RAG insights does NOT wipe `insightUpdatedAt` (see
 * `seed-payload-upsert.ts`'s `toCountryUpsertOps` — it reads existing
 * per-city insight state first and carries it forward).
 *
 * Run: npm run seed:destinations --workspace=backend
 */
import path from "path";
import * as dotenv from "dotenv";
import mongoose from "mongoose";
import { Country } from "../src/features/destinations/models/Country";
import { buildAllCountrySeedPayloads } from "../src/features/destinations/services/world-destinations.builder";
import {
  toCountryUpsertOps,
  type ExistingCountryInsights,
} from "../src/features/destinations/services/seed-payload-upsert";

dotenv.config();

async function loadExistingInsights(): Promise<ExistingCountryInsights> {
  const docs = await Country.find({})
    .select("idKey cities.idKey cities.insightText cities.insightUpdatedAt")
    .lean();

  const existing: ExistingCountryInsights = new Map();
  for (const doc of docs) {
    existing.set(
      doc.idKey,
      doc.cities.map((c) => ({
        idKey: c.idKey,
        insightText: c.insightText ?? null,
        insightUpdatedAt: c.insightUpdatedAt ?? null,
      })),
    );
  }
  return existing;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to Mongo.");

  const seedDataDir = path.join(process.cwd(), "scripts", "seed-data");
  const payloads = buildAllCountrySeedPayloads(seedDataDir);
  console.log(`Built ${payloads.length} country payloads from ${seedDataDir}.`);

  const existing = await loadExistingInsights();
  const ops = toCountryUpsertOps(payloads, existing);

  if (ops.length === 0) {
    console.log("Nothing to seed.");
  } else {
    const result = await Country.bulkWrite(ops);
    console.log(
      `Upserted ${result.upsertedCount} new, matched ${result.matchedCount}, modified ${result.modifiedCount} countries.`,
    );
  }

  const supportedCount = payloads.filter((p) => p.isSupported).length;
  console.log(`${supportedCount} countries marked isSupported (RAG-enabled).`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
