import type { JobOutcome } from "@travelplan/shared";

/**
 * Pure generator for synthetic JobMetric-shaped records — used only by
 * backend/scripts/seed-job-metrics.ts (never in production code) to let
 * the SLO math (Phase 3) and dashboard (Phase 8) be iterated on quickly
 * without spending real Gemini quota or waiting on real job traffic.
 */
export interface SyntheticOutcomeDistribution {
  completed: number;
  fallback: number;
  failed: number;
}

const DEFAULT_DISTRIBUTION: SyntheticOutcomeDistribution = {
  completed: 0.9,
  fallback: 0.05,
  failed: 0.05,
};

export interface SyntheticJobMetric {
  jobId: string;
  outcome: JobOutcome;
  queueWaitMs: number;
  processingMs: number;
  endToEndMs: number;
  attemptsMade: number;
  finishedAt: Date;
}

const DEFAULT_SPREAD_MS = 60 * 60 * 1000;

export interface GenerateSyntheticOutcomesOptions {
  /** How far back from `now` finishedAt can land. Defaults to 1 hour (prior hardcoded behavior) — pass e.g. SLO_WINDOW_DAYS in ms to spread across a full compliance window. */
  spreadMs?: number;
  /** Injectable RNG so a sweep/measurement script can get fully reproducible output instead of `Math.random()`. */
  rand?: () => number;
}

/**
 * Generates `n` records whose outcome counts match `distribution` as
 * closely as integer rounding allows. Every jobId is prefixed
 * `synthetic-` so it can never be mistaken for a real recording. Latency
 * values are randomized but bounded (failed jobs skew faster — they
 * usually error out before the full AI pipeline completes).
 */
export function generateSyntheticOutcomes(
  n: number,
  distribution: SyntheticOutcomeDistribution = DEFAULT_DISTRIBUTION,
  now: Date = new Date(),
  options: GenerateSyntheticOutcomesOptions = {},
): SyntheticJobMetric[] {
  if (n <= 0) return [];

  const spreadMs = options.spreadMs ?? DEFAULT_SPREAD_MS;
  const rand = options.rand ?? Math.random;

  const completedCount = Math.round(n * distribution.completed);
  const fallbackCount = Math.round(n * distribution.fallback);
  const failedCount = Math.max(0, n - completedCount - fallbackCount);

  const outcomes: JobOutcome[] = [
    ...(Array(completedCount).fill("completed") as JobOutcome[]),
    ...(Array(fallbackCount).fill("fallback") as JobOutcome[]),
    ...(Array(failedCount).fill("failed") as JobOutcome[]),
  ];

  return outcomes.map((outcome, i) => {
    const queueWaitMs = Math.round(200 + rand() * 2000);
    const processingMs =
      outcome === "failed"
        ? Math.round(500 + rand() * 3000)
        : Math.round(3000 + rand() * 15000);

    return {
      jobId: `synthetic-${now.getTime()}-${i}`,
      outcome,
      queueWaitMs,
      processingMs,
      endToEndMs: queueWaitMs + processingMs,
      attemptsMade: outcome === "failed" ? 3 : 1,
      finishedAt: new Date(now.getTime() - rand() * spreadMs),
    };
  });
}
