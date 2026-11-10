/**
 * B3 · Exports the PlaceInsight corpus (with embeddings) into the offline
 * eval snapshot at backend/eval/data/corpus/. READ-ONLY against Mongo: one
 * `find()`, nothing else. All decisions about what the snapshot contains
 * live in src/lib/rag-eval/snapshot-builder.ts (unit-tested); this file is
 * only I/O.
 *
 * Run (Lam, against staging — gate G1 in docs/implementation/b3-progress.md):
 *   npm run eval:export-snapshot -w backend
 *   npm run eval:export-snapshot -w backend -- --out=<dir>
 *
 * MONGO_URI comes from the shell or backend/.env. Deliberately does not
 * import src/config/env.ts — envalid would demand every unrelated API key.
 * Re-export only when the corpus changes: each export adds ~6 MB of binary
 * to git history permanently.
 */
import path from "node:path";
import fs from "node:fs";
import * as dotenv from "dotenv";
import mongoose from "mongoose";
import { PlaceInsight } from "../src/features/destinations/models/PlaceInsight";
import { EMBEDDING_MODEL } from "../src/config/gemini-models";
import {
  buildSnapshot,
  type RawInsightDoc,
} from "../src/lib/rag-eval/snapshot-builder";
import {
  parseSnapshot,
  SNAPSHOT_BIN_FILE,
  SNAPSHOT_META_FILE,
} from "../src/lib/rag-eval/snapshot-loader";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const DEFAULT_OUT = path.resolve(__dirname, "..", "eval", "data", "corpus");

function argValue(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  return arg?.split("=").slice(1).join("=");
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set (shell or backend/.env).");
    process.exit(1);
  }
  const outDir = path.resolve(argValue("--out") ?? DEFAULT_OUT);

  await mongoose.connect(uri);
  const sourceDb = mongoose.connection.db?.databaseName ?? "unknown";
  console.log(
    `Connected (db: ${sourceDb}). Reading PlaceInsight with embeddings...`,
  );

  const raw = (await PlaceInsight.find({})
    .select("+embedding -_id -__v -createdAt -updatedAt")
    .lean()) as unknown as RawInsightDoc[];
  await mongoose.disconnect();

  const { meta, bin } = buildSnapshot(raw, {
    exportedAt: new Date(),
    sourceDb,
    embeddingModel: EMBEDDING_MODEL,
  });

  // Verify the exact bytes we're about to write load back cleanly.
  const metaJson = `${JSON.stringify(meta, null, 2)}\n`;
  parseSnapshot(metaJson, bin);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, SNAPSHOT_META_FILE), metaJson);
  fs.writeFileSync(path.join(outDir, SNAPSHOT_BIN_FILE), bin);

  const cities = new Set(meta.docs.map((d) => d.cityIdKey)).size;
  console.log(
    [
      `snapshotId: ${meta.snapshotId}`,
      `docs: ${meta.count} across ${cities} cities, dims: ${meta.dims}`,
      `lossless float32: ${meta.lossless}`,
      `binary: ${(bin.length / 1024 / 1024).toFixed(2)} MB, sha256 ${meta.binSha256}`,
      `written to ${outDir}`,
    ].join("\n"),
  );
  if (!meta.lossless) {
    console.warn(
      "WARNING: some embedding values are not exactly float32 — offline cosine will differ slightly from Atlas.",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
