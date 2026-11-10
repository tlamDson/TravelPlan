/**
 * Offline-vs-Atlas agreement (S5): how often the in-process exact cosine
 * returns the same top k as the real `$vectorSearch` for the same cached
 * query vector. Pure; the Atlas calls live in scripts/eval-rag.ts.
 */

export function overlapAtK(a: string[], b: string[], k: number): number {
  const ta = a.slice(0, k);
  const tb = new Set(b.slice(0, k));
  const denom = Math.max(ta.length, tb.size);
  if (denom === 0) return 1;
  return ta.filter((x) => tb.has(x)).length / denom;
}

export interface ParityPair {
  id: string;
  offline: string[];
  atlas: string[];
}

export function summarizeParity(pairs: ParityPair[], k: number) {
  const scored = pairs.map((p) => ({
    ...p,
    overlap: overlapAtK(p.offline, p.atlas, k),
    exact:
      p.offline.slice(0, k).length === p.atlas.slice(0, k).length &&
      p.offline.slice(0, k).every((x, i) => p.atlas[i] === x),
  }));
  const n = scored.length;
  return {
    k,
    n,
    meanOverlap: n === 0 ? 0 : scored.reduce((s, p) => s + p.overlap, 0) / n,
    exactOrderRate: n === 0 ? 0 : scored.filter((p) => p.exact).length / n,
    worst: scored
      .filter((p) => p.overlap < 1)
      .sort((a, b) => a.overlap - b.overlap),
  };
}
