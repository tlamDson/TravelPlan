import type { LatencyStats } from "@travelplan/shared";

/**
 * Nearest-rank percentile over a copied, numerically-sorted array. Never
 * mutates the input. Nearest-rank (not interpolated) always returns a
 * value that was actually observed — p99 of 5 samples is a real job's
 * latency, not a fictional number computed between two samples.
 *
 * Percentiles do NOT average — you cannot combine two windows' p95s into
 * a correct overall p95. Callers that need stats over a merged window
 * must recompute from the raw samples, not from previously-computed
 * percentiles (this is why the reliability recorder stores per-job
 * latency samples rather than pre-aggregated rollups).
 *
 * Returns 0 for an empty array (documented convention — never NaN/throws).
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length) - 1;
  const index = Math.min(Math.max(rank, 0), sorted.length - 1);
  return sorted[index]!;
}

/** p50/p95/p99/max over one latency window (e.g. queue wait, processing, end-to-end). */
export function computeLatencyStats(values: number[]): LatencyStats {
  return {
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length > 0 ? Math.max(...values) : 0,
  };
}
