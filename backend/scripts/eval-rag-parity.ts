/**
 * `eval:rag --parity` (S5): runs the real Atlas `$vectorSearch` — same
 * index, numCandidates and city filter as place-insight-retrieval.service.ts
 * — with each golden query's *cached* vector, and compares its top k with
 * the offline exact-cosine top k. Read-only; no Gemini calls.
 */
import path from "node:path";
import * as dotenv from "dotenv";
import mongoose from "mongoose";
import { PlaceInsight } from "../src/features/destinations/models/PlaceInsight";
import { toLabel } from "../src/lib/rag-eval/label";
import { createVectorRetriever } from "../src/lib/rag-eval/vector-retriever";
import { summarizeParity, type ParityPair } from "../src/lib/rag-eval/parity";
import type { GoldenSet } from "../src/lib/rag-eval/golden-schema";
import type { CorpusSnapshot } from "../src/lib/rag-eval/snapshot-loader";
import type { QueryEmbeddingCache } from "../src/lib/rag-eval/query-embedding-cache";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const K = 5;
// Restated from place-insight-retrieval.service.ts (a literal there, not an
// export) — keep the two in sync. The index name is imported lazily below
// because vector-index.service pulls in config/env.
const NUM_CANDIDATES = 100;

export async function runParity(
  golden: GoldenSet,
  snapshot: CorpusSnapshot,
  queries: QueryEmbeddingCache,
) {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("--parity needs MONGO_URI (shell or backend/.env)");
  const { VECTOR_INDEX_NAME } =
    await import("../src/features/destinations/services/vector-index.service");

  const offline = createVectorRetriever(snapshot);
  await mongoose.connect(uri);
  const pairs: ParityPair[] = [];
  try {
    for (const item of golden.items) {
      const vector = queries.get(item.query);
      const atlas = await PlaceInsight.aggregate([
        {
          $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: "embedding",
            queryVector: Array.from(vector),
            numCandidates: NUM_CANDIDATES,
            limit: K,
            filter: { cityIdKey: item.cityIdKey },
          },
        },
        { $project: { _id: 0, cityIdKey: 1, name: 1 } },
      ]);
      pairs.push({
        id: item.id,
        offline: offline.retrieve(
          { id: item.id, text: item.query, cityIdKey: item.cityIdKey, vector },
          "city",
          K,
        ),
        atlas: atlas.map((d: { cityIdKey: string; name: string }) =>
          toLabel(d),
        ),
      });
    }
  } finally {
    await mongoose.disconnect();
  }
  return {
    snapshotId: snapshot.meta.snapshotId,
    checkedAt: new Date().toISOString(),
    ...summarizeParity(pairs, K),
  };
}
