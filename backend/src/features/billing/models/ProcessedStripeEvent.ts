import mongoose, { Schema, Document } from "mongoose";

export interface IProcessedStripeEvent extends Document {
  eventId: string;
  createdAt: Date;
}

/** Stripe retries a failed delivery for up to 3 days; keep ids well past that. */
export const PROCESSED_STRIPE_EVENT_TTL_SECONDS = 60 * 60 * 24 * 30;

const ProcessedStripeEventSchema = new Schema<IProcessedStripeEvent>(
  {
    eventId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

ProcessedStripeEventSchema.index({ eventId: 1 }, { unique: true });
ProcessedStripeEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: PROCESSED_STRIPE_EVENT_TTL_SECONDS },
);

export default mongoose.model<IProcessedStripeEvent>(
  "ProcessedStripeEvent",
  ProcessedStripeEventSchema,
);
