/**
 * B2 · Seeds the experiment catalog (packages/shared/src/constants/
 * experiments.ts) into the `experiments` collection. New experiments are
 * inserted as `draft`, so nobody is assigned; existing docs are left as
 * they are. Starting one is a manual owner step: set its `status` to
 * "running" and EXPERIMENTS_ENABLED=true on the API.
 *
 * Run: npm run seed:experiments -w backend   (needs backend/.env MONGO_URI)
 */
import mongoose from "mongoose";
import { env } from "../src/config/env";
import { logger } from "../src/lib/logger";
import { seedExperimentCatalog } from "../src/features/experiments/services/experiment-catalog.service";

async function main() {
  await mongoose.connect(env.MONGO_URI);
  try {
    const result = await seedExperimentCatalog();
    logger.info(result, "experiment catalog seeded");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, "experiment catalog seed failed");
  process.exit(1);
});
