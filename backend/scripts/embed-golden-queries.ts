/**
 * B3 · Embeds every golden query not yet in the query-embedding cache
 * (backend/eval/data/queries/). Uses the production embedText() so query
 * vectors come from exactly the call path trip generation uses. Needs
 * GEMINI_API_KEY plus envalid's other required vars (backend/.env).
 *
 *   npm run eval:embed-queries -w backend -- --dry-run   (count only, no API calls)
 *   npm run eval:embed-queries -w backend
 *
 * Paced under the free-tier embedContent quota (~100/min) and saves every
 * 10 queries, so a 429 or crash loses at most 10 calls — just re-run.
 */
import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";
import { EMBEDDING_MODEL } from "../src/config/gemini-models";
import { GOLDEN_PATH, QUERY_CACHE_DIR } from "../src/lib/rag-eval/eval-paths";
import { loadGoldenSet } from "../src/lib/rag-eval/golden-io";
import {
  QUERY_BIN_FILE,
  QUERY_INDEX_FILE,
  loadQueryEmbeddingCache,
  mergeQueryEmbeddings,
  missingTexts,
  parseQueryEmbeddingCache,
  type QueryEmbeddingCache,
} from "../src/lib/rag-eval/query-embedding-cache";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const PACE_MS = 700; // ≈ 85 requests/minute
const SAVE_EVERY = 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function save(
  cache: QueryEmbeddingCache | null,
  dims: number,
  batch: Map<string, number[]>,
) {
  const { indexJson, bin } = mergeQueryEmbeddings(
    cache,
    EMBEDDING_MODEL,
    dims,
    batch,
  );
  fs.mkdirSync(QUERY_CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(QUERY_CACHE_DIR, QUERY_BIN_FILE), bin);
  fs.writeFileSync(path.join(QUERY_CACHE_DIR, QUERY_INDEX_FILE), indexJson);
  return parseQueryEmbeddingCache(indexJson, bin);
}

async function main() {
  const golden = loadGoldenSet(GOLDEN_PATH);
  let cache = loadQueryEmbeddingCache(QUERY_CACHE_DIR);
  const todo = missingTexts(
    cache,
    golden.items.map((i) => i.query),
  );
  console.log(
    `${golden.items.length} golden queries, ${todo.length} not embedded yet.`,
  );
  if (todo.length === 0 || process.argv.includes("--dry-run")) return;

  // Imported lazily: embedding.service pulls in config/env (envalid), which
  // --dry-run shouldn't need.
  const { embedText } =
    await import("../src/features/destinations/services/embedding.service");

  let batch = new Map<string, number[]>();
  for (const [n, text] of todo.entries()) {
    batch.set(text, await embedText(text));
    if (batch.size >= SAVE_EVERY || n === todo.length - 1) {
      cache = save(cache, batch.values().next().value!.length, batch);
      batch = new Map();
      console.log(`  embedded ${n + 1}/${todo.length}`);
    }
    await sleep(PACE_MS);
  }
  console.log(`Done. Cache now holds ${cache!.byKey.size} query embeddings.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
