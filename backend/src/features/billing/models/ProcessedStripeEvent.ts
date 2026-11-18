import mongoose, { Schema, Document } from "mongoose";

/**
 * A Stripe event whose handler already succeeded. Written only after success,
 * so a failed delivery leaves no record and Stripe's retry is processed again.
 */
export interface IProcessedStripeEvent extends Document {
  eventId: string;
  /** When the handler succeeded; the TTL counts from here. */
  processedAt: Date;
}

/** Stripe retries a failed delivery for up to 3 days; keep ids well past that. */
export const PROCESSED_STRIPE_EVENT_TTL_SECONDS = 60 * 60 * 24 * 30;

const ProcessedStripeEventSchema = new Schema<IProcessedStripeEvent>({
  eventId: { type: String, required: true },
  processedAt: { type: Date, required: true },
});

ProcessedStripeEventSchema.index({ eventId: 1 }, { unique: true });
ProcessedStripeEventSchema.index(
  { processedAt: 1 },
  { expireAfterSeconds: PROCESSED_STRIPE_EVENT_TTL_SECONDS },
);

export default mongoose.model<IProcessedStripeEvent>(
  "ProcessedStripeEvent",
  ProcessedStripeEventSchema,
);
