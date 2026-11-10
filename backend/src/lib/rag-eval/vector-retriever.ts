/**
 * Exact in-process cosine retrieval over the snapshot — the offline
 * stand-in for Atlas `$vectorSearch` (index similarity "cosine",
 * vector-index.service.ts). Atlas reports (1 + cos) / 2, a monotonic
 * transform, so the ranking is the same; `--parity` measures how closely
 * the two actually agree.
 */
import {
  candidateRows,
  type Retriever,
  type RetrievalQuery,
  type Setting,
} from "./retriever";
import type { CorpusSnapshot } from "./snapshot-loader";

function norm(v: Float32Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
  return Math.sqrt(s);
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  const n = norm(a) * norm(b);
  return n === 0 ? 0 : dot(a, b) / n;
}

/** Scores every candidate row; ties broken by row so results are stable. */
export function scoreRows(
  snapshot: CorpusSnapshot,
  norms: Float64Array,
  q: RetrievalQuery,
  setting: Setting,
): { row: number; score: number }[] {
  if (q.vector.length !== snapshot.meta.dims) {
    throw new Error(
      `query ${q.id}: vector has ${q.vector.length} dims, snapshot has ${snapshot.meta.dims}`,
    );
  }
  const qn = norm(q.vector);
  return candidateRows(snapshot, setting, q.cityIdKey)
    .map((row) => {
      const n = qn * norms[row]!;
      return {
        row,
        score: n === 0 ? 0 : dot(q.vector, snapshot.vector(row)) / n,
      };
    })
    .sort((a, b) => b.score - a.score || a.row - b.row);
}

export type DenseRanker = (q: RetrievalQuery, setting: Setting) => number[];

/** Row ranking by exact cosine, with doc norms precomputed once. */
export function denseRanker(snapshot: CorpusSnapshot): DenseRanker {
  const norms = new Float64Array(snapshot.meta.count);
  for (let r = 0; r < snapshot.meta.count; r++)
    norms[r] = norm(snapshot.vector(r));
  return (q, setting) =>
    scoreRows(snapshot, norms, q, setting).map(({ row }) => row);
}

export function createVectorRetriever(
  snapshot: CorpusSnapshot,
  id = "vector-prod",
): Retriever {
  const rank = denseRanker(snapshot);
  return {
    id,
    params: { similarity: "cosine", exact: true },
    retrieve: (q, setting, k) =>
      rank(q, setting)
        .slice(0, k)
        .map((row) => snapshot.docs[row]!.label),
  };
}
