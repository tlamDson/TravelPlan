import { z } from "zod";

/**
 * Contracts for the trip-generation reliability layer
 * (backend/src/features/reliability/). See packages/shared/src/constants/slo.ts
 * for the numeric targets these shapes get evaluated against.
 */

/**
 * `fallback` = trip.processor.ts's static-template path (BullMQ itself
 * reports this job as `completed` — the outcome recorder is what tells
 * the two apart). Lowercase to match `job.returnvalue.status` casing as
 * read off the real job; keep the recorder and this schema in lockstep.
 */
export const jobOutcomeSchema = z.enum(["completed", "fallback", "failed"]);
export type JobOutcome = z.infer<typeof jobOutcomeSchema>;

export const sliResultSchema = z
  .object({
    validEvents: z.number().int().min(0),
    goodEvents: z.number().int().min(0),
    badEvents: z.number().int().min(0),
    /** null when insufficientData is true — never a default of 1 or 0. */
    sli: z.number().min(0).max(1).nullable(),
    insufficientData: z.boolean(),
  })
  .refine((v) => v.goodEvents + v.badEvents === v.validEvents, {
    message: "goodEvents + badEvents must equal validEvents",
    path: ["validEvents"],
  });
export type SliResult = z.infer<typeof sliResultSchema>;

export const errorBudgetSchema = z.object({
  target: z.number().min(0).max(1),
  budgetTotal: z.number().min(0),
  budgetConsumed: z.number().min(0),
  /** Clamped at 0 — never negative, even when the budget is over-exhausted. */
  budgetRemaining: z.number().min(0),
  /** > 1.0 means the SLO is already missed for this window. */
  consumedRatio: z.number().min(0),
  burnRate: z.number().min(0),
  exhaustsAt: z.string().datetime().nullable(),
});
export type ErrorBudget = z.infer<typeof errorBudgetSchema>;

/** Nearest-rank percentiles over one latency window (queue wait / processing / end-to-end). */
export const latencyStatsSchema = z
  .object({
    count: z.number().int().min(0),
    p50: z.number().min(0),
    p95: z.number().min(0),
    p99: z.number().min(0),
    max: z.number().min(0),
  })
  .refine((v) => v.p50 <= v.p95 && v.p95 <= v.p99 && v.p99 <= v.max, {
    message: "percentiles must be non-decreasing: p50 <= p95 <= p99 <= max",
    path: ["p50"],
  });
export type LatencyStats = z.infer<typeof latencyStatsSchema>;

const latencyWindowsSchema = z.object({
  queueWaitMs: latencyStatsSchema,
  processingMs: latencyStatsSchema,
  endToEndMs: latencyStatsSchema,
});

const trafficSchema = z.object({
  totalJobs: z.number().int().min(0),
  jobsPerHour: z.number().min(0),
});

const errorsSchema = z.object({
  sli: sliResultSchema,
  /** Reported separately from failureRate so a reader can see WHICH kind of badness is burning budget. */
  fallbackRate: z.number().min(0).max(1).nullable(),
  failureRate: z.number().min(0).max(1).nullable(),
});

const queueSaturationSchema = z.object({
  name: z.string(),
  waiting: z.number().int().min(0),
  active: z.number().int().min(0),
  delayed: z.number().int().min(0),
  failed: z.number().int().min(0),
  paused: z.number().int().min(0),
  concurrency: z.number().int().min(0),
  utilisation: z.number().min(0),
  /** True when getJobCounts() rejected for this queue — partial observability beats none. */
  error: z.boolean().optional(),
});

const saturationSchema = z.object({
  queues: z.array(queueSaturationSchema),
  workerAlive: z.boolean(),
  lastHeartbeatAt: z.string().datetime().nullable(),
  stalledCount: z.number().int().min(0),
});

export const goldenSignalsSchema = z.object({
  latency: latencyWindowsSchema,
  traffic: trafficSchema,
  errors: errorsSchema,
  saturation: saturationSchema,
});
export type GoldenSignals = z.infer<typeof goldenSignalsSchema>;

// Note: burn rate lives on errorBudget.burnRate — not duplicated here, so
// there's exactly one place a consumer can read it from per window (no
// risk of the two drifting apart).
const windowReportSchema = z.object({
  sli: sliResultSchema,
  errorBudget: errorBudgetSchema,
});

export const sloReportResponseSchema = z.object({
  success: z.literal(true),
  generatedAt: z.string().datetime(),
  windows: z.object({
    compliance: windowReportSchema,
    fastBurn: windowReportSchema,
    slowBurn: windowReportSchema,
  }),
  signals: goldenSignalsSchema,
});
export type SloReportResponse = z.infer<typeof sloReportResponseSchema>;
