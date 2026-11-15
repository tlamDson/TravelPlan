import type { JobOutcome } from "@travelplan/shared";
import type { FailureReasonCode } from "../models/JobMetric";

/**
 * Pure job-outcome derivation — no I/O, no Mongo, no BullMQ import. Takes
 * a duck-typed subset of a real bullmq Job so tests never need to
 * construct one. This is where the plan's core honesty decisions live:
 * outcome is read from the job's own returnvalue (not BullMQ's
 * completed/failed state), and a "failed" event only counts once retries
 * are exhausted (not on every transient attempt).
 */
export interface JobLike {
  id?: string;
  name: string;
  data?: { tripId?: string };
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  attemptsMade: number;
  opts?: { attempts?: number };
  returnvalue?: { status?: string } | null;
}

export interface JobMetricInput {
  queue: string;
  jobName: string;
  jobId: string;
  outcome: JobOutcome;
  attemptsMade: number;
  queueWaitMs: number;
  processingMs: number;
  endToEndMs: number;
  failureReason?: FailureReasonCode;
  failureMessage?: string;
  tripId?: string;
  finishedAt: Date;
}

/**
 * True once BullMQ has exhausted retries for this job (attemptsMade has
 * reached opts.attempts). BullMQ fires a `failed` event on EVERY attempt,
 * not just the last one — recording on every event would count a job
 * that ultimately succeeds after one transient error as mostly-bad.
 * Defaults opts.attempts to 1 (BullMQ's own default, and the real shape
 * of e.g. sync-google-calendar jobs, which set no attempts option).
 */
export function isTerminalFailure(job: {
  attemptsMade: number;
  opts?: { attempts?: number };
}): boolean {
  const maxAttempts = job.opts?.attempts ?? 1;
  return job.attemptsMade >= maxAttempts;
}

const FAILURE_PATTERNS: Array<[RegExp, FailureReasonCode]> = [
  [/timeout/i, "AI_TIMEOUT"],
  [/429|quota|rate limit/i, "AI_QUOTA"],
  [/invalid json|validation/i, "VALIDATION_FAILED"],
  [/trip not found/i, "TRIP_NOT_FOUND"],
  [/job_data_invalid/i, "JOB_DATA_INVALID"],
];

const MAX_FAILURE_MESSAGE_LENGTH = 200;

/**
 * Redacts common secret-shaped substrings (API keys/tokens carried in a
 * query string or an Authorization header) before an error message is
 * stored. `JobMetric` is exposed through an HTTP endpoint in a later
 * phase — a leaked key inside a stored error would be a real exposure,
 * not just noisy.
 */
function scrubSecrets(message: string): string {
  return message
    .replace(/(key|token|api_key)=[^&\s]+/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

/**
 * Maps a raw thrown error to a bounded, closed-set reason code + a
 * scrubbed, truncated message. Raw `err.message` can contain a Gemini
 * prompt echo or an API URL (with a key/token) — unbounded cardinality
 * that would make the metric store both a leak risk and useless for
 * grouping.
 */
export function normalizeFailureReason(error: unknown): {
  code: FailureReasonCode;
  message: string;
} {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = scrubSecrets(rawMessage).slice(0, MAX_FAILURE_MESSAGE_LENGTH);

  for (const [pattern, code] of FAILURE_PATTERNS) {
    if (pattern.test(rawMessage)) return { code, message };
  }
  return { code: "UNKNOWN", message };
}

function deriveOutcome(job: JobLike, error?: unknown): JobOutcome {
  if (error) return "failed";
  return job.returnvalue?.status === "FALLBACK" ? "fallback" : "completed";
}

export interface ToJobMetricInputParams {
  queue: string;
  job: JobLike;
  error?: unknown;
  now: Date;
}

export function toJobMetricInput(
  params: ToJobMetricInputParams,
): JobMetricInput {
  const { queue, job, error, now } = params;

  // Defensive fallbacks — processedOn/finishedOn can be legitimately
  // absent (e.g. a job that errors before BullMQ marks it processed), and
  // must never produce NaN or a negative duration.
  const processedOn = job.processedOn ?? job.timestamp;
  const finishedOn = job.finishedOn ?? now.getTime();

  const queueWaitMs = Math.max(0, processedOn - job.timestamp);
  const processingMs = Math.max(0, finishedOn - processedOn);
  const endToEndMs = Math.max(0, finishedOn - job.timestamp);

  const failure = error ? normalizeFailureReason(error) : undefined;

  return {
    queue,
    jobName: job.name,
    jobId: String(job.id),
    outcome: deriveOutcome(job, error),
    attemptsMade: job.attemptsMade,
    queueWaitMs,
    processingMs,
    endToEndMs,
    // Conditionally spread rather than assigning `undefined` — this repo's
    // exactOptionalPropertyTypes treats "key present with value undefined"
    // as distinct from "key absent", and JobMetricInput's optional fields
    // must be genuinely absent when there's no failure/tripId.
    ...(failure?.code !== undefined ? { failureReason: failure.code } : {}),
    ...(failure?.message !== undefined
      ? { failureMessage: failure.message }
      : {}),
    ...(job.data?.tripId !== undefined ? { tripId: job.data.tripId } : {}),
    finishedAt: new Date(finishedOn),
  };
}
