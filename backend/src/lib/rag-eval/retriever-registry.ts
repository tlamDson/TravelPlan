/**
 * Named retriever configs selectable with `eval:rag --configs`. The first
 * config listed is the baseline every paired delta is measured against,
 * so `vector-prod` (production's dense-only path) comes first by default.
 */
import type { Retriever } from "./retriever";
import type { CorpusSnapshot } from "./snapshot-loader";
import { createVectorRetriever } from "./vector-retriever";
import { createBm25Retriever, createHybridRetriever } from "./hybrid-retriever";
import { getRewrite, type RewriteCache } from "./rewrite-cache";

export interface RetrieverContext {
  /** Required by hybrid-rewrite (backend/eval/data/rewrites/). */
  rewrites?: RewriteCache;
}

type Factory = (s: CorpusSnapshot, ctx: RetrieverContext) => Retriever;

const FACTORIES: Record<string, Factory> = {
  "vector-prod": (s) => createVectorRetriever(s),
  bm25: (s) => createBm25Retriever(s),
  hybrid: (s) => createHybridRetriever(s),
  "hybrid-rewrite": (s, { rewrites }) => {
    if (!rewrites)
      throw new Error(
        "hybrid-rewrite needs a rewrite cache — run npm run eval:rewrite-queries -w backend",
      );
    const r = createHybridRetriever(s, {
      id: "hybrid-rewrite",
      bm25Text: (q) => getRewrite(rewrites, q),
    });
    return {
      ...r,
      params: {
        ...r.params,
        rewriter: rewrites.model,
        promptSha: rewrites.promptSha,
      },
    };
  },
};

export const KNOWN_CONFIGS = Object.keys(FACTORIES);
export const DEFAULT_CONFIGS = ["vector-prod"];

export function buildRetrievers(
  snapshot: CorpusSnapshot,
  ids: string[],
  ctx: RetrieverContext = {},
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
    return make(snapshot, ctx);
  });
}
