import IdempotencyLog from "../models/IdempotencyLog";

export interface StoredIdempotency {
  status?: "pending" | "completed";
  tripId?: string;
  jobId?: string;
}

export type Reservation =
  | { reserved: true }
  | { reserved: false; existing: StoredIdempotency | null };

const DUPLICATE_KEY = 11000;

export const idempotencyLogRepository = {
  /**
   * Atomically claim `key` (the unique index decides the winner). A duplicate
   * returns the stored record instead of throwing.
   */
  async reserve(key: string, userId: string): Promise<Reservation> {
    try {
      await IdempotencyLog.create({ key, userId, status: "pending" });
      return { reserved: true };
    } catch (err) {
      if ((err as { code?: number }).code !== DUPLICATE_KEY) throw err;
      const existing = await IdempotencyLog.findOne({ key, userId })
        .lean()
        .exec();
      return { reserved: false, existing };
    }
  },

  async complete(
    key: string,
    userId: string,
    tripId: string,
    jobId: string,
  ): Promise<void> {
    await IdempotencyLog.updateOne(
      { key, userId },
      { $set: { tripId, jobId, status: "completed" } },
    );
  },

  /** Drop a still-pending reservation so a retry can enqueue. */
  async release(key: string, userId: string): Promise<void> {
    await IdempotencyLog.deleteOne({ key, userId, status: "pending" });
  },
};
