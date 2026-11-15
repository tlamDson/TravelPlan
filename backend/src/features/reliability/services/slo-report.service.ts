import {
  SLO_TARGET,
  SLO_WINDOW_DAYS,
  SLO_LATENCY_THRESHOLD_MS,
  FAST_BURN_WINDOW_HOURS,
  SLOW_BURN_WINDOW_HOURS,
} from "@travelplan/shared";
import type {
  SloReportResponse,
  SliResult,
  ErrorBudget,
} from "@travelplan/shared";
import { QUEUE_NAMES } from "../../../lib/queue-defaults";
import { jobMetricRepository } from "../repositories/job-metric.repository";
import { getSaturationSignal } from "./queue-saturation.service";
import { computeSli, computeErrorBudget } from "./slo-math";
import { computeLatencyStats } from "./latency-percentiles";

/**
 * Orchestrates Phase 3 (pure math) + Phase 4 (Mongo recording) + Phase 5
 * (worker liveness) into one report. Every window boundary is computed
 * from a single injected `now` — a drift here silently changes every
 * number on the page, which is why it's tested explicitly rather than
 * trusted.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface WindowReportInternal {
  sli: SliResult;
  errorBudget: ErrorBudget;
  rawCounts: { completed: number; fallback: number; failed: number };
}

async function buildWindowReport(
  queue: string,
  since: Date,
  until: Date,
): Promise<WindowReportInternal> {
  const [counts, slowButCompleted] = await Promise.all([
    jobMetricRepository.countByOutcome(queue, since, until),
    jobMetricRepository.countSlowCompleted(
      queue,
      since,
      until,
      SLO_LATENCY_THRESHOLD_MS,
    ),
  ]);

  const sli = computeSli(
    {
      completed: counts.completed,
      fallback: counts.fallback,
      failed: counts.failed,
      slowButCompleted,
    },
    { fallbackCountsAsGood: false },
  );
  const errorBudget = computeErrorBudget(sli, SLO_TARGET);

  return { sli, errorBudget, rawCounts: counts };
}

/** null when there's not enough data to trust a rate — never a fake 0. */
function computeSubRate(count: number, sli: SliResult): number | null {
  if (sli.insufficientData || sli.validEvents === 0) return null;
  return count / sli.validEvents;
}

export interface SloReportOptions {
  queue?: string;
  now?: Date;
  /** Overrides the compliance window (default SLO_WINDOW_DAYS). The two
   * burn windows stay fixed at FAST/SLOW_BURN_WINDOW_HOURS regardless —
   * those are SRE Workbook constants, not meant to be arbitrary. */
  windowDays?: number;
}

export async function buildSloReport(
  options: SloReportOptions = {},
): Promise<SloReportResponse> {
  const queue = options.queue ?? QUEUE_NAMES.TRIP_GENERATION;
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? SLO_WINDOW_DAYS;

  const complianceSince = new Date(now.getTime() - windowDays * DAY_MS);
  const fastBurnSince = new Date(
    now.getTime() - FAST_BURN_WINDOW_HOURS * HOUR_MS,
  );
  const slowBurnSince = new Date(
    now.getTime() - SLOW_BURN_WINDOW_HOURS * HOUR_MS,
  );

  const [compliance, fastBurn, slowBurn, latencySamples, saturation] =
    await Promise.all([
      buildWindowReport(queue, complianceSince, now),
      buildWindowReport(queue, fastBurnSince, now),
      buildWindowReport(queue, slowBurnSince, now),
      jobMetricRepository.findLatencySamples(queue, complianceSince, now),
      getSaturationSignal(now),
    ]);

  const latency = {
    queueWaitMs: computeLatencyStats(latencySamples.map((s) => s.queueWaitMs)),
    processingMs: computeLatencyStats(
      latencySamples.map((s) => s.processingMs),
    ),
    endToEndMs: computeLatencyStats(latencySamples.map((s) => s.endToEndMs)),
  };

  const windowHours = windowDays * 24;
  const traffic = {
    totalJobs: compliance.sli.validEvents,
    jobsPerHour: compliance.sli.validEvents / windowHours,
  };

  const errors = {
    sli: compliance.sli,
    fallbackRate: computeSubRate(compliance.rawCounts.fallback, compliance.sli),
    failureRate: computeSubRate(compliance.rawCounts.failed, compliance.sli),
  };

  return {
    success: true,
    generatedAt: now.toISOString(),
    windows: {
      compliance: { sli: compliance.sli, errorBudget: compliance.errorBudget },
      fastBurn: { sli: fastBurn.sli, errorBudget: fastBurn.errorBudget },
      slowBurn: { sli: slowBurn.sli, errorBudget: slowBurn.errorBudget },
    },
    signals: { latency, traffic, errors, saturation },
  };
}
