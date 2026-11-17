import IdempotencyLog from "../models/IdempotencyLog";

export type IdempotencyReservation =
  | { status: "reserved" }
  | {
      status: "duplicate";
      tripId?: string | undefined;
      jobId?: string | undefined;
    };

const isDuplicateKeyError = (err: unknown): boolean =>
  (err as { code?: number } | null)?.code === 11000;

/**
 * Idempotency keys for POST /api/trips, scoped per user. `reserve` inserts
 * first, so the unique (userId, key) index decides which of two concurrent
 * requests may enqueue.
 */
export class IdempotencyRepository {
  async reserve(userId: string, key: string): Promise<IdempotencyReservation> {
    // Make sure the unique index exists before relying on it (fresh DBs).
    await IdempotencyLog.init();
    try {
      await IdempotencyLog.create({ key, userId });
      return { status: "reserved" };
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const existing = await IdempotencyLog.findOne({ key, userId })
        .lean()
        .exec();
      return {
        status: "duplicate",
        tripId: existing?.tripId,
        jobId: existing?.jobId,
      };
    }
  }

  async complete(
    userId: string,
    key: string,
    result: { tripId: string; jobId: string },
  ): Promise<void> {
    await IdempotencyLog.updateOne(
      { key, userId },
      { $set: { tripId: result.tripId, jobId: result.jobId } },
    ).exec();
  }

  /** Frees a reservation whose enqueue failed, so the client can retry. */
  async release(userId: string, key: string): Promise<void> {
    await IdempotencyLog.deleteOne({
      key,
      userId,
      tripId: { $exists: false },
    }).exec();
  }
}

export const idempotencyRepository = new IdempotencyRepository();
