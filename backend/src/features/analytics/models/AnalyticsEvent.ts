import mongoose, { Schema } from "mongoose";
import type { AnalyticsEvent } from "@travelplan/shared";

/**
 * One accepted analytics event (B2 plan, PR 2). Only events that passed
 * `analyticsEventSchema` land here; `properties` is already strict-validated
 * per event name, so it is stored as Mixed. The unique `eventId` index is
 * what makes client retries and concurrent duplicates idempotent.
 */
export interface IAnalyticsEvent extends Omit<
  AnalyticsEvent,
  "occurredAt" | "properties"
> {
  occurredAt: Date;
  properties: Record<string, unknown>;
  receivedAt: Date;
}

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    eventId: { type: String, required: true, unique: true },
    schemaVersion: { type: Number, required: true },
    name: { type: String, required: true },
    occurredAt: { type: Date, required: true },
    sessionId: { type: String, required: true },
    /** HMAC of the Clerk userId (services/pseudonymize.ts), never raw. */
    userId: { type: String, default: null },
    source: { type: String, required: true },
    properties: { type: Schema.Types.Mixed, required: true },
    receivedAt: { type: Date, required: true },
  },
  { collection: "analytics_events", versionKey: false, minimize: false },
);

// Daily export (PR 5) and per-event metrics read by time window.
AnalyticsEventSchema.index({ occurredAt: 1 });
AnalyticsEventSchema.index({ name: 1, occurredAt: 1 });

export default mongoose.model<IAnalyticsEvent>(
  "AnalyticsEvent",
  AnalyticsEventSchema,
);
