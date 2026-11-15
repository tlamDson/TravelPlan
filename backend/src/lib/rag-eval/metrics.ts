/**
 * Retrieval evaluation metrics — pure, no DB/network access. Consumed by
 * scripts/eval-rag.ts against a golden set
 * (backend/src/test/fixtures/rag-golden-set.json).
 *
 * `relevant` is a map of label -> graded relevance (0/1/2, per the golden
 * set format in .claude/plans/1-rag-eval-eventual-hickey.md Phase 2); any
 * label not present in the map is implicitly grade 0 (irrelevant). Labels
 * are `${cityIdKey}::${name}`, matching retrievePlaceInsights()'s stable
 * id shape in place-insight-retrieval.service.ts.
 */

export type RelevanceMap = Record<string, number>;

function relevanceOf(relevant: RelevanceMap, id: string): number {
  return relevant[id] ?? 0;
}

/** |relevant ∩ retrieved[:k]| / |relevant|, where "relevant" means grade
 * > 0 — an explicit grade-0 label must not inflate the denominator. 0 by
 * convention when the relevant set is empty (0/0 is otherwise undefined). */
export function recallAtK(
  retrievedIds: string[],
  relevant: RelevanceMap,
  k: number,
): number {
  const relevantIds = Object.keys(relevant).filter(
    (id) => relevanceOf(relevant, id) > 0,
  );
  if (relevantIds.length === 0) return 0;

  const topK = new Set(retrievedIds.slice(0, k));
  const hits = relevantIds.filter((id) => topK.has(id)).length;
  return hits / relevantIds.length;
}

/** |relevant ∩ retrieved[:k]| / min(k, retrieved.length) — dividing by
 * the actual number returned (not the requested k) so a retriever isn't
 * punished for legitimately returning fewer than k results (e.g. a city
 * whose corpus has fewer than TOP_K docs total). */
export function precisionAtK(
  retrievedIds: string[],
  relevant: RelevanceMap,
  k: number,
): number {
  const topK = retrievedIds.slice(0, k);
  if (topK.length === 0) return 0;

  const hits = topK.filter((id) => relevanceOf(relevant, id) > 0).length;
  return hits / topK.length;
}

/** 1 / (1-indexed rank of the first relevant hit in the full ranking), or
 * 0 if no relevant item appears anywhere. */
export function mrr(retrievedIds: string[], relevant: RelevanceMap): number {
  for (let i = 0; i < retrievedIds.length; i++) {
    if (relevanceOf(relevant, retrievedIds[i]!) > 0) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function dcgAt(gains: number[], k: number): number {
  let sum = 0;
  for (let i = 0; i < Math.min(k, gains.length); i++) {
    // rank is 1-indexed in the standard formula, i is 0-indexed
    sum += (2 ** gains[i]! - 1) / Math.log2(i + 2);
  }
  return sum;
}

/** Graded-relevance nDCG@k: DCG@k of the actual ranking, divided by the
 * DCG@k of the ideal ranking (relevant items sorted by grade, descending).
 * 0 by convention when the relevant set is empty (IDCG would be 0). */
export function ndcgAtK(
  retrievedIds: string[],
  relevant: RelevanceMap,
  k: number,
): number {
  const idealGains = Object.values(relevant).sort((a, b) => b - a);
  const idcg = dcgAt(idealGains, k);
  if (idcg === 0) return 0;

  const actualGains = retrievedIds
    .slice(0, k)
    .map((id) => relevanceOf(relevant, id));
  const dcg = dcgAt(actualGains, k);

  return dcg / idcg;
}

/** 1 if at least one relevant item is within the top k, else 0. */
export function hitRate(
  retrievedIds: string[],
  relevant: RelevanceMap,
  k: number,
): number {
  const topK = retrievedIds.slice(0, k);
  return topK.some((id) => relevanceOf(relevant, id) > 0) ? 1 : 0;
}
