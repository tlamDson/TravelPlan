import mongoose, { Schema, Document } from "mongoose";

export interface IIdempotencyLog extends Document {
  key: string;
  userId: string;
  /** Absent on records written before reservations existed = completed. */
  status?: "pending" | "completed";
  tripId?: string;
  jobId?: string;
  createdAt: Date;
}

function isNotPending(this: IIdempotencyLog): boolean {
  return this.status !== "pending";
}

const IdempotencyLogSchema = new Schema<IIdempotencyLog>(
  {
    key: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    status: { type: String, enum: ["pending", "completed"] },
    // Unknown until the job is enqueued, so only required once completed.
    tripId: { type: String, required: isNotPending },
    jobId: { type: String, required: isNotPending },
  },
  { timestamps: true },
);

// Auto-delete after 24h
IdempotencyLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 },
);

export default mongoose.model<IIdempotencyLog>(
  "IdempotencyLog",
  IdempotencyLogSchema,
);
