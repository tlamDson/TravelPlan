import mongoose, { Schema } from "mongoose";
import {
  QUARANTINE_REASONS,
  type QuarantineIssue,
  type QuarantineReason,
} from "../services/quarantine-reason";

/**
 * An event that failed `analyticsEventSchema`. The raw payload is kept as
 * JSON text (capped, see analytics-ingest.service.ts) rather than as a
 * document: untrusted keys such as `$where` or `a.b` can't break the
 * insert, and an oversized event can't blow the 16 MB document limit.
 * Quarantined events are never deduplicated.
 */
export interface IAnalyticsQuarantine {
  reason: QuarantineReason;
  issues: QuarantineIssue[];
  raw: string;
  rawTruncated: boolean;
  receivedAt: Date;
}

const IssueSchema = new Schema<QuarantineIssue>(
  {
    path: { type: String, default: "" },
    code: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false },
);

const AnalyticsQuarantineSchema = new Schema<IAnalyticsQuarantine>(
  {
    reason: { type: String, enum: QUARANTINE_REASONS, required: true },
    issues: { type: [IssueSchema], default: [] },
    raw: { type: String, required: true },
    rawTruncated: { type: Boolean, required: true },
    receivedAt: { type: Date, required: true },
  },
  { collection: "analytics_quarantine", versionKey: false },
);

AnalyticsQuarantineSchema.index({ receivedAt: 1 });
AnalyticsQuarantineSchema.index({ reason: 1, receivedAt: 1 });

export default mongoose.model<IAnalyticsQuarantine>(
  "AnalyticsQuarantine",
  AnalyticsQuarantineSchema,
);
