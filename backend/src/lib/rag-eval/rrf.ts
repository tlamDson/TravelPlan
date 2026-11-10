/**
 * Reciprocal Rank Fusion (Cormack et al., 2009): score(d) = Σ_i w_i / (k + rank_i(d)),
 * 1-based ranks, a doc absent from a list contributes nothing for it.
 * k = 60 is the paper's default and is NOT tuned on the golden set.
 */

export const DEFAULT_RRF_K = 60;

export interface Fused {
  id: string;
  score: number;
}

export function rrfFuse(
  rankings: string[][],
  opts: { k?: number; weights?: number[] } = {},
): Fused[] {
  const k = opts.k ?? DEFAULT_RRF_K;
  const weights = opts.weights ?? rankings.map(() => 1);
  if (weights.length !== rankings.length) {
    throw new Error(
      `rrfFuse: ${weights.length} weights for ${rankings.length} rankings`,
    );
  }
  const acc = new Map<string, { score: number; best: number }>();
  rankings.forEach((list, li) => {
    list.forEach((id, i) => {
      const rank = i + 1;
      const e = acc.get(id) ?? { score: 0, best: Infinity };
      e.score += weights[li]! / (k + rank);
      e.best = Math.min(e.best, rank);
      acc.set(id, e);
    });
  });
  return [...acc.entries()]
    .sort(
      ([ia, a], [ib, b]) =>
        b.score - a.score ||
        a.best - b.best ||
        (ia < ib ? -1 : ia > ib ? 1 : 0),
    )
    .map(([id, { score }]) => ({ id, score }));
}
