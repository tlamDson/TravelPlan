import {
  ERROR_BUDGET_WARNING_RATIO,
  ERROR_BUDGET_CRITICAL_RATIO,
} from "@travelplan/shared";
import type { SliResult, ErrorBudget } from "@travelplan/shared";
import {
  generateSyntheticOutcomes,
  type SyntheticJobMetric,
} from "./synthetic-seed";

/**
 * Pure timeline builder + reading classifier for the false-healthy
 * measurement scripts (backend/scripts/measure-false-healthy.ts). No I/O
 * — a caller writes the returned records through jobMetricRepository and
 * reads them back via the real buildSloReport({ now }), so the
 * measurement exercises production math, not a re-implementation of it.
 */

export type ReadingStatus = "healthy" | "warning" | "critical" | "insufficient";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Classifies one SLO report reading exactly the way
 * ErrorBudgetGauge.tsx renders it: insufficientData is its own bucket
 * (the gauge shows a distinct "not enough data" card, not a green one),
 * then consumedRatio against the same shared thresholds the dashboard
 * uses. Counting "insufficient" as healthy would inflate the false-
 * healthy rate a measurement script reports.
 */
export function classifyReading(
  sli: Pick<SliResult, "insufficientData">,
  errorBudget: Pick<ErrorBudget, "consumedRatio">,
): ReadingStatus {
  if (sli.insufficientData) return "insufficient";
  if (errorBudget.consumedRatio >= ERROR_BUDGET_CRITICAL_RATIO)
    return "critical";
  if (errorBudget.consumedRatio >= ERROR_BUDGET_WARNING_RATIO) return "warning";
  return "healthy";
}

export interface IncidentTimelineParams {
  /** Reference instant everything else is measured relative to. */
  now: Date;
  /** How far back background traffic is spread, e.g. SLO_WINDOW_DAYS in ms. */
  backgroundWindowMs: number;
  /** Background traffic rate — same rate is used to size the incident window. */
  backgroundRatePerHour: number;
  incidentStart: Date;
  incidentDurationMs: number;
  /** Injectable RNG so a sweep is fully reproducible. */
  rand?: () => number;
}

/**
 * Builds one combined JobMetric-shaped timeline: mostly-healthy
 * background traffic spread across `backgroundWindowMs`, plus an
 * incident window where every job takes the static-fallback path — the
 * shape of the real gemini-2.0-flash outage (every trip silently became
 * a static template while BullMQ reported `completed`).
 */
export function buildIncidentTimeline(
  params: IncidentTimelineParams,
): SyntheticJobMetric[] {
  const rand = params.rand ?? Math.random;

  const backgroundHours = params.backgroundWindowMs / HOUR_MS;
  const backgroundCount = Math.round(
    backgroundHours * params.backgroundRatePerHour,
  );
  const background = generateSyntheticOutcomes(
    backgroundCount,
    { completed: 0.95, fallback: 0.02, failed: 0.03 },
    params.now,
    { spreadMs: params.backgroundWindowMs, rand },
  ).map((item, i) => ({
    ...item,
    jobId: `synthetic-bg-${params.now.getTime()}-${i}`,
  }));

  const incidentHours = params.incidentDurationMs / HOUR_MS;
  const incidentCount = Math.round(
    incidentHours * params.backgroundRatePerHour,
  );
  const incidentEnd = new Date(
    params.incidentStart.getTime() + params.incidentDurationMs,
  );
  const incident = generateSyntheticOutcomes(
    incidentCount,
    { completed: 0, fallback: 1, failed: 0 },
    incidentEnd,
    { spreadMs: params.incidentDurationMs, rand },
  ).map((item, i) => ({
    ...item,
    jobId: `synthetic-incident-${params.incidentStart.getTime()}-${i}`,
  }));

  return [...background, ...incident];
}
