/**
 * Replaces the legacy key-only unique index on `idempotencylogs` with the
 * compound unique {userId, key} index. Idempotent; safe to re-run. See
 * scripts/README.md ("Idempotency index migration") for the rollout order.
 *
 * Run: npm run migrate:idempotency-index --workspace=backend
 * Target DB comes from MONGO_URI (backend/.env or the environment).
 */
import * as dotenv from "dotenv";
import mongoose from "mongoose";
import IdempotencyLog from "../src/features/user/models/IdempotencyLog";
import { dropKeyOnlyIdempotencyIndex } from "../src/features/user/services/idempotency-index-migration";

dotenv.config();

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected to database "${mongoose.connection.name}".`);

  const result = await dropKeyOnlyIdempotencyIndex(IdempotencyLog.collection);
  console.log(
    result.createdCompound
      ? "Created unique index {userId, key}."
      : "Unique index {userId, key} already present.",
  );
  console.log(
    result.droppedKeyOnly
      ? "Dropped legacy key-only unique index."
      : "No key-only index to drop — nothing to do.",
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
