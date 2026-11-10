/**
 * Retriever contract for the offline eval. Two settings, fixed before any
 * final number is run (docs/implementation/b3-data-formats.md §4):
 *  - "global": the whole corpus, no city filter — the headline setting.
 *  - "city":   only the query's city (~20 docs) — the path trip
 *              generation actually takes (`filter: { cityIdKey }`).
 */
import type { CorpusSnapshot } from "./snapshot-loader";

export type Setting = "global" | "city";
export const SETTINGS: readonly Setting[] = ["global", "city"];

export interface RetrievalQuery {
  id: string;
  text: string;
  cityIdKey: string;
  vector: Float32Array;
}

export interface Retriever {
  id: string;
  params: Record<string, unknown>;
  /** Labels (toLabel) of the top k docs, best first. */
  retrieve(q: RetrievalQuery, setting: Setting, k: number): string[];
}

/** Snapshot rows a query may retrieve from, in row order. */
export function candidateRows(
  snapshot: CorpusSnapshot,
  setting: Setting,
  cityIdKey: string,
): number[] {
  const rows: number[] = [];
  snapshot.docs.forEach((d, i) => {
    if (setting === "global" || d.cityIdKey === cityIdKey) rows.push(i);
  });
  return rows;
}
