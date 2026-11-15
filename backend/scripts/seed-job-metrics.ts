/**
 * Seeds N synthetic JobMetric documents for FAST local iteration on the
 * SLO math (Phase 3) and dashboard (Phase 8) — no Gemini/Clerk/BullMQ
 * involved, just direct Mongo writes via jobMetricRepository. Every
 * jobId is prefixed `synthetic-` (see synthetic-seed.ts) so this data
 * can never be mistaken for a real recording.
 *
 * Refuses to run against anything that doesn't look like a local/dev
 * MONGO_URI — running this against staging/production would pollute the
 * real SLI with invented numbers.
 *
 * Run: npm run seed:job-metrics --workspace=backend -- --n=1000
 */
import * as dotenv from "dotenv";
import mongoose from "mongoose";
import { generateSyntheticOutcomes } from "../src/features/reliability/services/synthetic-seed";
import { jobMetricRepository } from "../src/features/reliability/repositories/job-metric.repository";
import { QUEUE_NAMES } from "../src/lib/queue-defaults";

dotenv.config();

function parseCount(): number {
  const arg = process.argv.find((a) => a.startsWith("--n="));
  const n = arg ? Number(arg.split("=")[1]) : 200;
  return Number.isFinite(n) && n > 0 ? n : 200;
}

function assertLocalMongoUri(uri: string): void {
  if (!/localhost|127\.0\.0\.1/.test(uri)) {
    console.error(
      "Refusing to seed synthetic data — MONGO_URI does not look like " +
        "localhost/dev. This script must never run against staging/" +
        "production: it would pollute the real SLI with invented numbers.",
    );
    process.exit(1);
  }
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
    return;
  }
  assertLocalMongoUri(uri);

  await mongoose.connect(uri);
  console.log("Connected to Mongo.");

  const n = parseCount();
  const items = generateSyntheticOutcomes(n);

  for (const item of items) {
    await jobMetricRepository.record({
      queue: QUEUE_NAMES.TRIP_GENERATION,
      jobName: "generate-trip",
      jobId: item.jobId,
      outcome: item.outcome,
      attemptsMade: item.attemptsMade,
      queueWaitMs: item.queueWaitMs,
      processingMs: item.processingMs,
      endToEndMs: item.endToEndMs,
      finishedAt: item.finishedAt,
    });
  }

  console.log(`Seeded ${items.length} synthetic JobMetric documents.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
