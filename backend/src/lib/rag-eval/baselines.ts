/**
 * Closed-form reference points printed beside every config, so a number
 * like "recall@5 = 0.40" can be read against what chance and a perfect
 * ranker would score on the same pool. Exact expectations, not Monte
 * Carlo, so they're deterministic and hand-checkable (baselines.test.ts).
 */

const disc = (rank: number) => 1 / Math.log2(rank + 1);
const gain = (grade: number) => 2 ** grade - 1;

function idcgAt(grades: number[], k: number): number {
  return [...grades]
    .sort((a, b) => b - a)
    .slice(0, k)
    .reduce((s, g, i) => s + gain(g) * disc(i + 1), 0);
}

/**
 * Expected metrics for a uniformly random ranking of a pool of `poolSize`
 * docs containing the relevant docs with `grades` (all > 0).
 */
export function randomExpected(
  poolSize: number,
  grades: number[],
  ks: number[],
): Record<string, number> {
  const N = poolSize;
  const r = grades.length;
  const out: Record<string, number> = {};
  // Each relevant doc is in the top k with probability min(k, N) / N.
  for (const k of ks) out[`recall@${k}`] = Math.min(k, N) / N;

  // P(first relevant at rank i) = C(N-i, r-1) / C(N, r), built iteratively:
  // p1 = r/N, p(i+1) = p(i) * (N-i-r+1) / (N-i).
  let p = r / N;
  let mrr = 0;
  for (let i = 1; i <= N - r + 1; i++) {
    mrr += p / i;
    p *= (N - i - r + 1) / (N - i);
  }
  out.mrr = mrr;

  // Every doc is equally likely at every position: E[DCG@5] = Σgain · mean discount of the top 5.
  const top = Math.min(5, N);
  let discSum = 0;
  for (let i = 1; i <= top; i++) discSum += disc(i);
  const eDcg = grades.reduce((s, g) => s + gain(g), 0) * (discSum / N);
  out["ndcg@5"] = eDcg / idcgAt(grades, 5);
  return out;
}

/** A ranker that puts every relevant doc first, best grade first. */
export function oracleMetrics(
  grades: number[],
  ks: number[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of ks)
    out[`recall@${k}`] = Math.min(k, grades.length) / grades.length;
  out.mrr = 1;
  out["ndcg@5"] = 1;
  return out;
}
