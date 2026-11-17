import IdempotencyLog from "../models/IdempotencyLog";

/**
 * How long a reservation may stay without a result before it counts as
 * abandoned (its request failed partway or its process died). Enqueueing is
 * one Mongo insert plus one Redis add, so this is far above normal latency.
 */
export const PENDING_TIMEOUT_MS = 60_000;

export type IdempotencyReservation =
  | { status: "reserved" }
  | { status: "completed"; tripId: string; jobId: string }
  /** Another request holds the key and may still enqueue. */
  | { status: "pending" }
  /** The holder never stored a result; a trip may or may not exist. */
  | { status: "abandoned" };

const errorCode = (err: unknown): number | undefined =>
  (err as { code?: number } | null)?.code;
const isDuplicateKeyError = (err: unknown): boolean => errorCode(err) === 11000;

/**
 * Idempotency keys for POST /api/trips, scoped per user. `reserve` inserts
 * first, so the unique (userId, key) index decides which of two concurrent
 * requests may enqueue.
 */
export class IdempotencyRepository {
  private indexesReady: Promise<void> | null = null;

  /**
   * Builds the schema indexes once per process (retried if it failed). It
   * never drops an index, so it is safe while an older revision still runs.
   */
  private ensureIndexes(): Promise<void> {
    this.indexesReady ??= IdempotencyLog.createIndexes().catch(
      (err: unknown) => {
        this.indexesReady = null;
        throw err;
      },
    );
    return this.indexesReady;
  }

  async reserve(userId: string, key: string): Promise<IdempotencyReservation> {
    // The unique (userId, key) index must exist before relying on it.
    await this.ensureIndexes();
    try {
      await IdempotencyLog.create({ key, userId });
      return { status: "reserved" };
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const existing = await IdempotencyLog.findOne({ key, userId })
        .lean()
        .exec();
      if (existing?.tripId && existing.jobId) {
        return {
          status: "completed",
          tripId: existing.tripId,
          jobId: existing.jobId,
        };
      }
      const age = existing
        ? Date.now() - new Date(existing.createdAt).getTime()
        : 0;
      return age > PENDING_TIMEOUT_MS
        ? { status: "abandoned" }
        : { status: "pending" };
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
