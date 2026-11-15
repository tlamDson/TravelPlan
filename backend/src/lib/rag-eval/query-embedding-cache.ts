/**
 * Cache of golden-query embeddings (backend/eval/data/queries/) so the
 * offline eval never calls Gemini. Keyed by sha256 of the exact query
 * text. A missing entry throws — silently skipping a query would shrink N
 * and inflate the reported numbers.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { decodeF32, encodeF32, sha256Hex } from "./snapshot-codec";

export const QUERY_INDEX_FILE = "query-embeddings.index.json";
export const QUERY_BIN_FILE = "query-embeddings.f32";

const IndexSchema = z.object({
  model: z.string().min(1),
  dims: z.number().int().positive(),
  count: z.number().int().nonnegative(),
  binSha256: z.string().regex(/^[0-9a-f]{64}$/),
  entries: z.record(z.string(), z.number().int().nonnegative()),
});

export interface QueryEmbeddingCache {
  model: string;
  dims: number;
  has(text: string): boolean;
  get(text: string): Float32Array;
  /** key → vector, for merging. */
  byKey: Map<string, Float32Array>;
}

export const queryKey = (text: string): string => sha256Hex(text);

/** Builds from key → vector. Rows sorted by key so output is identical
 * regardless of insertion order. */
function buildFromKeys(
  model: string,
  dims: number,
  byKey: Map<string, number[]>,
) {
  const keys = [...byKey.keys()].sort();
  for (const k of keys) {
    if (byKey.get(k)!.length !== dims)
      throw new Error(`query embedding ${k}: wrong dims, expected ${dims}`);
  }
  const bin = encodeF32(
    keys.map((k) => byKey.get(k)!),
    dims,
  );
  const index = {
    model,
    dims,
    count: keys.length,
    binSha256: sha256Hex(bin),
    entries: Object.fromEntries(keys.map((k, row) => [k, row])),
  };
  return { indexJson: `${JSON.stringify(index, null, 2)}\n`, bin };
}

export function buildQueryEmbeddingCache(
  model: string,
  dims: number,
  byText: Map<string, number[]>,
) {
  return buildFromKeys(
    model,
    dims,
    new Map([...byText].map(([t, v]) => [queryKey(t), v])),
  );
}

export function mergeQueryEmbeddings(
  existing: QueryEmbeddingCache | null,
  model: string,
  dims: number,
  newByText: Map<string, number[]>,
) {
  if (existing && (existing.model !== model || existing.dims !== dims)) {
    throw new Error(
      `query cache holds model ${existing.model} (${existing.dims} dims), refusing to mix in model ${model} (${dims} dims)`,
    );
  }
  const byKey = new Map<string, number[]>();
  for (const [k, v] of existing?.byKey ?? []) byKey.set(k, Array.from(v));
  for (const [t, v] of newByText) byKey.set(queryKey(t), v);
  return buildFromKeys(model, dims, byKey);
}

export function parseQueryEmbeddingCache(
  indexJson: string,
  bin: Buffer,
): QueryEmbeddingCache {
  const index = IndexSchema.parse(JSON.parse(indexJson));
  if (sha256Hex(bin) !== index.binSha256) {
    throw new Error("query embedding cache: binary sha256 != index binSha256");
  }
  const flat = decodeF32(bin, index.dims, index.count);
  const byKey = new Map<string, Float32Array>();
  for (const [k, row] of Object.entries(index.entries)) {
    if (row >= index.count)
      throw new Error(`query embedding cache: row ${row} out of range`);
    byKey.set(k, flat.subarray(row * index.dims, (row + 1) * index.dims));
  }
  return {
    model: index.model,
    dims: index.dims,
    byKey,
    has: (text) => byKey.has(queryKey(text)),
    get(text) {
      const v = byKey.get(queryKey(text));
      if (!v) {
        throw new Error(
          `missing query embedding for "${text}" — run npm run eval:embed-queries -w backend`,
        );
      }
      return v;
    },
  };
}

export function missingTexts(
  cache: QueryEmbeddingCache | null,
  texts: string[],
): string[] {
  return [...new Set(texts)].filter((t) => !cache?.has(t));
}

/** null when the cache hasn't been created yet; throws if it's corrupt. */
export function loadQueryEmbeddingCache(
  dir: string,
): QueryEmbeddingCache | null {
  const indexPath = path.join(dir, QUERY_INDEX_FILE);
  const binPath = path.join(dir, QUERY_BIN_FILE);
  if (!fs.existsSync(indexPath) && !fs.existsSync(binPath)) return null;
  return parseQueryEmbeddingCache(
    fs.readFileSync(indexPath, "utf8"),
    fs.readFileSync(binPath),
  );
}
