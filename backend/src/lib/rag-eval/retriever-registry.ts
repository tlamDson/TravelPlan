/**
 * Named retriever configs selectable with `eval:rag --configs`. The first
 * config listed is the baseline every paired delta is measured against,
 * so `vector-prod` (production's dense-only path) comes first by default.
 * Later PRs register bm25 / hybrid / rerank configs here.
 */
import type { Retriever } from "./retriever";
import type { CorpusSnapshot } from "./snapshot-loader";
import { createVectorRetriever } from "./vector-retriever";

const FACTORIES: Record<string, (s: CorpusSnapshot) => Retriever> = {
  "vector-prod": (s) => createVectorRetriever(s),
};

export const KNOWN_CONFIGS = Object.keys(FACTORIES);
export const DEFAULT_CONFIGS = ["vector-prod"];

export function buildRetrievers(
  snapshot: CorpusSnapshot,
  ids: string[],
): Retriever[] {
  if (ids.length === 0) throw new Error("no retriever configs requested");
  const seen = new Set<string>();
  return ids.map((id) => {
    if (seen.has(id)) throw new Error(`config ${id} requested twice`);
    seen.add(id);
    const make = FACTORIES[id];
    if (!make)
      throw new Error(
        `unknown config ${id} — known: ${KNOWN_CONFIGS.join(", ")}`,
      );
    return make(snapshot);
  });
}
