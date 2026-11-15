/**
 * Tiny hand-built corpus snapshot for rag-eval unit tests — 2 cities, 4
 * docs, 2-dim embeddings. Built through the real builder/loader so tests
 * exercise the same contract as the committed snapshot.
 */
import {
  buildSnapshot,
  type RawInsightDoc,
} from "../lib/rag-eval/snapshot-builder";
import {
  parseSnapshot,
  type CorpusSnapshot,
} from "../lib/rag-eval/snapshot-loader";

export function insightDoc(
  cityIdKey: string,
  countryIdKey: string,
  name: string,
  embedding: number[],
): RawInsightDoc {
  return {
    cityIdKey,
    countryIdKey,
    name,
    category: "food",
    description: `${name} description`,
    tags: [],
    sourceQuery: "food",
    embedding,
  };
}

export function tinySnapshot(): CorpusSnapshot {
  const built = buildSnapshot(
    [
      insightDoc("tokyo", "jp", "Golden Gai", [1, 0]),
      insightDoc("tokyo", "jp", "Tsukiji Outer Market", [0, 1]),
      insightDoc("hanoi", "vn", "Bun Cha Huong Lien", [0.5, 0.5]),
      insightDoc("hanoi", "vn", "Hoan Kiem Lake", [-1, 0]),
    ],
    {
      exportedAt: new Date("2026-11-12T00:00:00.000Z"),
      sourceDb: "test",
      embeddingModel: "gemini-embedding-001",
    },
  );
  return parseSnapshot(JSON.stringify(built.meta), built.bin);
}
