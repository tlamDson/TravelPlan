import mongoose, { Schema, Document } from "mongoose";
import { JOB_METRIC_TTL_DAYS } from "@travelplan/shared";
import type { JobOutcome } from "@travelplan/shared";

/** Closed set — never store raw err.message as the reason code. Raw
 * messages can echo a Gemini prompt or an API URL (leak risk) and have
 * unbounded cardinality (useless as a metric dimension). */
export type FailureReasonCode =
  | "AI_TIMEOUT"
  | "AI_QUOTA"
  | "VALIDATION_FAILED"
  | "TRIP_NOT_FOUND"
  | "JOB_DATA_INVALID"
  | "UNKNOWN";

export interface IJobMetric extends Document {
  queue: string;
  jobName: string;
  jobId: string;
  outcome: JobOutcome;
  attemptsMade: number;
  queueWaitMs: number;
  processingMs: number;
  endToEndMs: number;
  failureReason?: FailureReasonCode;
  /** Truncated to 200 chars — bounded, not the raw error. */
  failureMessage?: string;
  /** Drill-down only — no userId here (see model file header). */
  tripId?: string;
  finishedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const JobMetricSchema = new Schema<IJobMetric>(
  {
    queue: { type: String, required: true },
    jobName: { type: String, required: true },
    jobId: { type: String, required: true },
    outcome: {
      type: String,
      enum: ["completed", "fallback", "failed"],
      required: true,
    },
    attemptsMade: { type: Number, required: true, min: 1 },
    queueWaitMs: { type: Number, required: true, min: 0 },
    processingMs: { type: Number, required: true, min: 0 },
    endToEndMs: { type: Number, required: true, min: 0 },
    failureReason: {
      type: String,
      enum: [
        "AI_TIMEOUT",
        "AI_QUOTA",
        "VALIDATION_FAILED",
        "TRIP_NOT_FOUND",
        "JOB_DATA_INVALID",
        "UNKNOWN",
      ],
    },
    failureMessage: { type: String, maxlength: 200 },
    tripId: { type: String },
    finishedAt: { type: Date, required: true },
    // TTL: exceeds SLO_WINDOW_DAYS (see packages/shared/src/constants/slo.ts)
    // so the compliance window is always fully backed by real documents.
    expiresAt: {
      type: Date,
      default: () =>
        new Date(Date.now() + JOB_METRIC_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true },
);

// The only query shape the reliability report uses: "this queue, this window".
JobMetricSchema.index({ queue: 1, finishedAt: -1 });
// Correctness, not tidiness — a stalled job whose lock expired can be
// re-picked-up and completed twice, and BullMQ can re-emit events on
// reconnect. Without this, one job double-counts and the SLI moves.
JobMetricSchema.index({ queue: 1, jobId: 1 }, { unique: true });
JobMetricSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IJobMetric>("JobMetric", JobMetricSchema);
