/**
 * Okapi BM25 over pre-tokenized docs. Corpus statistics (df, avgdl) come
 * from every doc the index was built on; `rank()` then scores only the
 * candidate rows — so in the city setting a term's rarity is judged
 * against the whole corpus, matching production (PR 5) where the index
 * covers all PlaceInsight text and the city is a filter.
 *
 * idf(t) = ln(1 + (N − df + 0.5) / (df + 0.5))   (Lucene's, never negative)
 */

export interface Bm25Params {
  k1: number;
  b: number;
}

export const DEFAULT_BM25: Bm25Params = { k1: 1.2, b: 0.75 };

export interface Bm25Index {
  params: Bm25Params;
  score(queryTokens: string[], row: number): number;
  /** Candidate rows with score > 0, best first; ties broken by row. */
  rank(queryTokens: string[], rows: number[]): number[];
}

export function createBm25Index(
  docs: string[][],
  params: Bm25Params = DEFAULT_BM25,
): Bm25Index {
  const N = docs.length;
  const lengths = docs.map((d) => d.length);
  const avgdl = N === 0 ? 0 : lengths.reduce((s, l) => s + l, 0) / N;
  const tfs = docs.map((d) => {
    const m = new Map<string, number>();
    for (const t of d) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  });
  const df = new Map<string, number>();
  for (const m of tfs)
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => {
    const n = df.get(t) ?? 0;
    return n === 0 ? 0 : Math.log(1 + (N - n + 0.5) / (n + 0.5));
  };

  const { k1, b } = params;
  const score = (queryTokens: string[], row: number): number => {
    const tf = tfs[row];
    if (!tf) throw new Error(`bm25: row ${row} out of range`);
    const norm = k1 * (1 - b + (b * lengths[row]!) / (avgdl || 1));
    let s = 0;
    for (const t of new Set(queryTokens)) {
      const f = tf.get(t);
      if (f) s += idf(t) * ((f * (k1 + 1)) / (f + norm));
    }
    return s;
  };

  return {
    params,
    score,
    rank: (queryTokens, rows) =>
      rows
        .map((row) => ({ row, s: score(queryTokens, row) }))
        .filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s || x.row - y.row)
        .map((x) => x.row),
  };
}
