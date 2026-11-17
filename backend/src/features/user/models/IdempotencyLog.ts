import mongoose, { Schema, Document } from "mongoose";

export interface IIdempotencyLog extends Document {
  key: string;
  userId: string;
  /** Unset while the request that reserved the key is still enqueueing. */
  tripId?: string;
  jobId?: string;
  createdAt: Date;
}

const IdempotencyLogSchema = new Schema<IIdempotencyLog>(
  {
    key: { type: String, required: true },
    userId: { type: String, required: true },
    tripId: { type: String },
    jobId: { type: String },
  },
  { timestamps: true },
);

// A key is reserved per user: the insert is the lock against double submits.
IdempotencyLogSchema.index({ userId: 1, key: 1 }, { unique: true });

// Auto-delete after 24h
IdempotencyLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 },
);

/**
 * Its own collection, not the legacy `idempotencylogs` (unique on `key` alone,
 * `tripId` required). An older API revision still running during a deploy
 * keeps using that one, so neither revision reads the other's documents and
 * no index has to be dropped; the legacy documents expire through their TTL.
 */
export const IDEMPOTENCY_COLLECTION = "idempotency_reservations";

export default mongoose.model<IIdempotencyLog>(
  "IdempotencyLog",
  IdempotencyLogSchema,
  IDEMPOTENCY_COLLECTION,
);
