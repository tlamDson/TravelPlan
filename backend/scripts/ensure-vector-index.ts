/**
 * Creates (or verifies) the Atlas `$vectorSearch` index that RAG retrieval
 * depends on. Safe to re-run — idempotent.
 *
 * Run: npm run ensure:vector-index --workspace=backend
 *
 * Needs a real Atlas connection (Atlas Search indexes aren't available on
 * a plain community-edition/local Mongo, including the docker-compose one
 * used by integration tests) — set MONGO_URI to the Atlas cluster first.
 */
import * as dotenv from "dotenv";
import mongoose from "mongoose";
import { ensureVectorIndex } from "../src/features/destinations/services/vector-index.service";

dotenv.config();

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set — cannot connect to Atlas.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected to Mongo. Ensuring vector search index...`);

  const result = await ensureVectorIndex();
  console.log(
    result.created
      ? `Created index "${result.name}".`
      : `Index "${result.name}" already exists — nothing to do.`,
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
