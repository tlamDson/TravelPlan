import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../../config/env";
import { EMBEDDING_MODEL } from "../../../config/gemini-models";

const EMBEDDING_DIMS = 3072; // gemini-embedding-001 outputs 3072 dimensions

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }
  return genAI;
}

export async function embedText(text: string): Promise<number[]> {
  const ai = getClient();
  const model = ai.getGenerativeModel({ model: EMBEDDING_MODEL });

  const res = await model.embedContent(text);
  const embedding = res.embedding?.values;

  if (!embedding || embedding.length !== EMBEDDING_DIMS) {
    throw new Error(`Embedding failed or wrong dims: ${embedding?.length}`);
  }

  return embedding;
}

/**
 * Max simultaneous embedContent calls in-flight. gemini-embedding-001 has
 * no batch endpoint, so embedTexts() fans out one HTTP call per text — a
 * city can have 15-30 entities, and an uncapped Promise.all was firing all
 * of them at once, tripping Gemini's rate limit. `insight-worker.ts`
 * throttles at 1 city/2s via BullMQ, but that says nothing about
 * concurrency *within* a single city's entity list.
 */
export const EMBED_CONCURRENCY = 5;

/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once,
 * returning results in the same order as `items` regardless of which
 * call finishes first. Callers (insight-worker.ts) zip the result array
 * back up positionally against the original entities, so preserving
 * input order — not completion order — is load-bearing.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // gemini-embedding-001 has no batch endpoint — run one call per text,
  // capped at EMBED_CONCURRENCY in-flight to avoid tripping rate limits.
  return mapWithConcurrency(texts, EMBED_CONCURRENCY, (text) =>
    embedText(text),
  );
}

export { EMBEDDING_DIMS };
