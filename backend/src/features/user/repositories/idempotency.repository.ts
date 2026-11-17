import IdempotencyLog from "../models/IdempotencyLog";

export type IdempotencyReservation =
  | { status: "reserved" }
  | {
      status: "duplicate";
      tripId?: string | undefined;
      jobId?: string | undefined;
    };

const errorCode = (err: unknown): number | undefined =>
  (err as { code?: number } | null)?.code;
const isDuplicateKeyError = (err: unknown): boolean => errorCode(err) === 11000;

/** Unique on `key` alone, from before keys were scoped per user. */
const LEGACY_KEY_INDEX = "key_1";
const NAMESPACE_NOT_FOUND = 26;
const INDEX_NOT_FOUND = 27;

/**
 * Drops the legacy global index (Mongoose never drops indexes on its own),
 * then builds the schema's (userId, key) unique index.
 */
async function migrateIndexes(): Promise<void> {
  try {
    const indexes = await IdempotencyLog.collection.indexes();
    if (indexes.some((i) => i.name === LEGACY_KEY_INDEX)) {
      await IdempotencyLog.collection.dropIndex(LEGACY_KEY_INDEX);
    }
  } catch (err) {
    const code = errorCode(err);
    if (code !== NAMESPACE_NOT_FOUND && code !== INDEX_NOT_FOUND) throw err;
  }
  await IdempotencyLog.createIndexes();
}

/**
 * Idempotency keys for POST /api/trips, scoped per user. `reserve` inserts
 * first, so the unique (userId, key) index decides which of two concurrent
 * requests may enqueue.
 */
export class IdempotencyRepository {
  private indexesReady: Promise<void> | null = null;

  /** Runs the index migration once per process; retried if it failed. */
  private ensureIndexes(): Promise<void> {
    this.indexesReady ??= migrateIndexes().catch((err: unknown) => {
      this.indexesReady = null;
      throw err;
    });
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
