/**
 * LLM query rewrites for the BM25 side of `hybrid-rewrite`, cached so the
 * eval never calls an LLM (backend/eval/data/rewrites/<rewriterId>.json).
 * Each entry records the sha of the query text it was made from: a query
 * edited after rewriting is "stale" and throws, as does a missing entry —
 * falling back to the raw query would silently change what's measured.
 */
import { z } from "zod";
import { sha256Hex } from "./snapshot-codec";

/** Zero-shot, fixed before any eval run — not tuned on the golden set. */
export const REWRITE_PROMPT = [
  "You rewrite a traveler's question into a short keyword query for a keyword (BM25) search",
  "over short descriptions of places in one city.",
  "Output ONLY the keywords on one line: the key nouns, likely place types, and close synonyms.",
  "No explanation, no quotes, at most 15 words. Do not invent specific place names.",
].join(" ");
export const REWRITE_PROMPT_SHA = sha256Hex(REWRITE_PROMPT);

const CacheSchema = z.object({
  model: z.string().min(1),
  promptSha: z.string(),
  entries: z.record(
    z.string(),
    z.object({ rewritten: z.string().min(1), querySha: z.string() }),
  ),
});
export type RewriteCache = z.infer<typeof CacheSchema>;

export interface RewriteQuery {
  id: string;
  text: string;
}

export const emptyRewriteCache = (model: string): RewriteCache => ({
  model,
  promptSha: REWRITE_PROMPT_SHA,
  entries: {},
});

export function parseRewriteCache(json: string): RewriteCache {
  const c = CacheSchema.parse(JSON.parse(json));
  if (c.promptSha !== REWRITE_PROMPT_SHA) {
    throw new Error(
      "rewrite cache was produced by a different prompt — re-run eval:rewrite-queries",
    );
  }
  return c;
}

export function serializeRewriteCache(c: RewriteCache): string {
  const entries = Object.fromEntries(
    Object.entries(c.entries).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return `${JSON.stringify({ ...c, entries }, null, 2)}\n`;
}

export function upsertRewrite(
  c: RewriteCache,
  q: RewriteQuery,
  rewritten: string,
): RewriteCache {
  return {
    ...c,
    entries: {
      ...c.entries,
      [q.id]: { rewritten, querySha: sha256Hex(q.text) },
    },
  };
}

export function getRewrite(c: RewriteCache, q: RewriteQuery): string {
  const e = c.entries[q.id];
  if (!e)
    throw new Error(
      `missing rewrite for ${q.id} — run npm run eval:rewrite-queries -w backend`,
    );
  if (e.querySha !== sha256Hex(q.text))
    throw new Error(`stale rewrite for ${q.id}: query text changed`);
  return e.rewritten;
}

export const needsRewrite = (c: RewriteCache, q: RewriteQuery): boolean =>
  c.entries[q.id]?.querySha !== sha256Hex(q.text);

/** Cleans raw chat output: drops a Qwen <think> block, keeps the first
 * non-empty line, strips quotes and trailing punctuation, caps length. */
export function parseRewriteOutput(raw: string): string {
  const line = raw
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) throw new Error("rewrite output is empty");
  return line
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.!?;:]+$/, "")
    .slice(0, 200)
    .trim();
}
