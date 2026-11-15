/**
 * Enqueues REAL trip-generation jobs — real Gemini calls, real worker
 * processing, bypassing Clerk entirely — spaced out to stay within the
 * Gemini free-tier's 20-request/day quota by default. Requires
 * `npm run dev:worker` running separately to actually process the jobs.
 *
 * Unlike seed-job-metrics.ts (synthetic, instant, free), this validates
 * the whole reliability-recording pipeline against real outcomes —
 * including a real FALLBACK if the day's quota runs out mid-run.
 *
 * Run: npm run seed:real-trip-jobs --workspace=backend -- --count=20 --intervalMinutes=3 --tier=free
 */
import * as dotenv from "dotenv";
import mongoose from "mongoose";
import { enqueueRealTripJobs } from "../src/features/reliability/services/seed-real-trip-jobs";

dotenv.config();

function parseArg(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = arg ? Number(arg.split("=")[1]) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseTier(): "free" | "pro" {
  const arg = process.argv.find((a) => a.startsWith("--tier="));
  return arg?.split("=")[1] === "pro" ? "pro" : "free";
}

function assertLocalMongoUri(uri: string): void {
  // This script is more dangerous than seed-job-metrics.ts — it doesn't
  // just write synthetic metrics, it creates real Trip documents and
  // spends real Gemini free-tier quota. Pointed at staging/production it
  // would litter real data with `userId: "seed-test-user"` trips and burn
  // quota shared with real users.
  if (!/localhost|127\.0\.0\.1/.test(uri)) {
    console.error(
      "Refusing to run — MONGO_URI does not look like localhost/dev. " +
        "This script creates real Trip documents and spends real Gemini " +
        "quota; it must never run against staging/production.",
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

  const count = parseArg("count", 20);
  const intervalMinutes = parseArg("intervalMinutes", 3);
  const userTier = parseTier();

  console.log(
    `Enqueuing ${count} real trip-generation jobs, ${intervalMinutes} min apart, tier=${userTier}. ` +
      "Make sure `npm run dev:worker` is running in another terminal.",
  );

  const enqueued = await enqueueRealTripJobs({
    count,
    intervalMs: intervalMinutes * 60 * 1000,
    userTier,
    onEnqueued: (jobId, index) =>
      console.log(`[${index + 1}/${count}] enqueued job ${jobId}`),
  });

  console.log(`Done — enqueued ${enqueued} real trip-generation jobs.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
