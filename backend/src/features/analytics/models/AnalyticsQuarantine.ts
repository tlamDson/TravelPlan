import mongoose, { Schema } from "mongoose";
import {
  QUARANTINE_REASONS,
  type QuarantineIssue,
  type QuarantineReason,
} from "../services/quarantine-reason";

/**
 * An event that failed `analyticsEventSchema` or the client policy. No raw
 * payload is kept — an invalid event can carry anything, PII included —
 * only the eventId when it is a UUID, the name when it is in the catalog,
 * the HMAC of the claimed userId and each issue's masked path and code
 * (see QuarantineIssue). No free text from the client. Never deduplicated.
 */
export interface IAnalyticsQuarantine {
  reason: QuarantineReason;
  issues: QuarantineIssue[];
  eventId: string | null;
  eventName: string | null;
  userIdHash: string | null;
  receivedAt: Date;
}

const IssueSchema = new Schema<QuarantineIssue>(
  {
    path: { type: String, default: "" },
    code: { type: String, required: true },
  },
  { _id: false },
);

const AnalyticsQuarantineSchema = new Schema<IAnalyticsQuarantine>(
  {
    reason: { type: String, enum: QUARANTINE_REASONS, required: true },
    issues: { type: [IssueSchema], default: [] },
    eventId: { type: String, default: null },
    eventName: { type: String, default: null },
    userIdHash: { type: String, default: null },
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
