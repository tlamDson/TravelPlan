import mongoose, { Schema, Document } from "mongoose";

/** A Stripe webhook event id whose handling finished (redelivery guard). */
export interface IStripeEvent extends Document {
  eventId: string;
  type: string;
  createdAt: Date;
}

const StripeEventSchema = new Schema<IStripeEvent>(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Stripe retries a failed delivery for up to 3 days; keep ids for 30.
StripeEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 },
);

export default mongoose.model<IStripeEvent>("StripeEvent", StripeEventSchema);
