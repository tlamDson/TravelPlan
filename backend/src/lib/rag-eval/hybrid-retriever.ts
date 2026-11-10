/**
 * BM25-only and hybrid (dense + BM25, fused with RRF) retrievers over the
 * snapshot. Every parameter here is a published default (BM25 k1/b, RRF k)
 * or a structural choice (candidate depth), fixed before any eval run, so
 * none of them is tuned on the golden set and no cross-validation is needed.
 */
import { createBm25Index, DEFAULT_BM25 } from "./bm25";
import { DEFAULT_RRF_K, rrfFuse } from "./rrf";
import { tokenize, insightText } from "./tokenize";
import {
  candidateRows,
  type Retriever,
  type RetrievalQuery,
} from "./retriever";
import { denseRanker } from "./vector-retriever";
import type { CorpusSnapshot } from "./snapshot-loader";

/** How deep each list goes into the fusion. ≥ the city pool (~20), and the
 * `limit` PR 5's production hybrid path will request from Atlas. */
export const CANDIDATE_DEPTH = 50;

function bm25For(snapshot: CorpusSnapshot) {
  return createBm25Index(snapshot.docs.map((d) => tokenize(insightText(d))));
}

export function createBm25Retriever(
  snapshot: CorpusSnapshot,
  id = "bm25",
): Retriever {
  const index = bm25For(snapshot);
  return {
    id,
    params: { ...DEFAULT_BM25, tokenizer: "fold-lower-en-stop" },
    retrieve: (q, setting, k) =>
      index
        .rank(tokenize(q.text), candidateRows(snapshot, setting, q.cityIdKey))
        .slice(0, k)
        .map((row) => snapshot.docs[row]!.label),
  };
}

export interface HybridOpts {
  id?: string;
  /** Text the BM25 side searches with (default: the query itself). */
  bm25Text?: (q: RetrievalQuery) => string;
}

export function createHybridRetriever(
  snapshot: CorpusSnapshot,
  opts: HybridOpts = {},
): Retriever {
  const index = bm25For(snapshot);
  const dense = denseRanker(snapshot);
  const bm25Text = opts.bm25Text ?? ((q: RetrievalQuery) => q.text);
  const label = (row: number) => snapshot.docs[row]!.label;

  return {
    id: opts.id ?? "hybrid",
    params: {
      ...DEFAULT_BM25,
      rrfK: DEFAULT_RRF_K,
      candidateDepth: CANDIDATE_DEPTH,
      weights: [1, 1],
    },
    retrieve(q, setting, k) {
      const denseRows = dense(q, setting).slice(0, CANDIDATE_DEPTH);
      const sparseRows = index
        .rank(
          tokenize(bm25Text(q)),
          candidateRows(snapshot, setting, q.cityIdKey),
        )
        .slice(0, CANDIDATE_DEPTH);
      return rrfFuse([denseRows.map(label), sparseRows.map(label)], {
        k: DEFAULT_RRF_K,
      })
        .slice(0, k)
        .map((f) => f.id);
    },
  };
}
