import mongoose, { Schema, Document } from "mongoose";

export type ProcessedStripeEventStatus = "processing" | "done";

export interface IProcessedStripeEvent extends Document {
  eventId: string;
  /** `processing` = a delivery holds the claim; `done` = side effect applied. */
  status: ProcessedStripeEventStatus;
  /** Lease end while `processing`; an expired lease may be taken over. */
  lockedUntil: Date;
  createdAt: Date;
}

/** Stripe retries a failed delivery for up to 3 days; keep ids well past that. */
export const PROCESSED_STRIPE_EVENT_TTL_SECONDS = 60 * 60 * 24 * 30;

const ProcessedStripeEventSchema = new Schema<IProcessedStripeEvent>(
  {
    eventId: { type: String, required: true },
    status: {
      type: String,
      enum: ["processing", "done"],
      required: true,
      default: "processing",
    },
    lockedUntil: { type: Date, required: true },
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
