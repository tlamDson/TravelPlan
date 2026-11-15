/**
 * B2 · Exports one UTC day of `analytics_events` to
 * `<out>/events-<day>.jsonl.gz` for analytics/ (Python). READ-ONLY against
 * Mongo. userId, sessionId and any email-looking string are keyed hashes in
 * the file (src/features/analytics/services/export-row.ts); the file is
 * still gitignored.
 *
 * Run:
 *   npm run analytics:export -w backend                       # yesterday (UTC)
 *   npm run analytics:export -w backend -- --day=2026-11-02
 *   npm run analytics:export -w backend -- --day=2026-11-02 --out=<dir>
 *
 * Needs backend/.env (MONGO_URI, ANALYTICS_HASH_SECRET — the same secret
 * the ingest used, or ids won't join). Imports config/env.ts, so the usual
 * required vars must be set.
 */
import path from "node:path";
import mongoose from "mongoose";
import { env } from "../src/config/env";
import { logger } from "../src/lib/logger";
import { assertAnalyticsHashSecret } from "../src/features/analytics/services/pseudonymize";
import { exportAnalyticsDay } from "../src/features/analytics/services/analytics-export.service";
import { previousUtcDay } from "../src/features/analytics/services/export-row";

const DEFAULT_OUT = path.resolve(
  __dirname,
  "..",
  "..",
  "analytics",
  "data",
  "events",
);

function argValue(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  return arg?.split("=").slice(1).join("=");
}

async function main() {
  assertAnalyticsHashSecret();
  const day = argValue("--day") ?? previousUtcDay(new Date());
  const outDir = path.resolve(argValue("--out") ?? DEFAULT_OUT);

  await mongoose.connect(env.MONGO_URI);
  try {
    const result = await exportAnalyticsDay(day, outDir);
    logger.info(result, "analytics day exported");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, "analytics export failed");
  process.exit(1);
});
