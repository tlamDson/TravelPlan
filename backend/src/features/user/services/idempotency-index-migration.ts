import type { mongo } from "mongoose";

type Collection = mongo.Collection;

export interface IdempotencyIndexMigrationResult {
  createdCompound: boolean;
  droppedKeyOnly: boolean;
}

const fieldsOf = (key: Record<string, unknown>): string[] => Object.keys(key);

const isKeyOnly = (key: Record<string, unknown>): boolean => {
  const f = fieldsOf(key);
  return f.length === 1 && f[0] === "key";
};

const isCompound = (key: Record<string, unknown>): boolean => {
  const f = fieldsOf(key);
  return f.length === 2 && f[0] === "userId" && f[1] === "key";
};

const NAMESPACE_NOT_FOUND = 26;
const INDEX_NOT_FOUND = 27;

/**
 * Move IdempotencyLog uniqueness from `key` alone to `{userId, key}`.
 *
 * Idempotent, and safe while old and new API revisions overlap: the compound
 * unique index is created first, so uniqueness is never missing, and the
 * key-only index is dropped only afterwards. Re-running is a no-op.
 */
export async function dropKeyOnlyIdempotencyIndex(
  collection: Collection,
): Promise<IdempotencyIndexMigrationResult> {
  let indexes: Awaited<ReturnType<Collection["indexes"]>>;
  try {
    indexes = await collection.indexes();
  } catch (err) {
    // Nothing to migrate yet; the new schema builds the right index on boot.
    if ((err as { code?: number }).code === NAMESPACE_NOT_FOUND) {
      return { createdCompound: false, droppedKeyOnly: false };
    }
    throw err;
  }

  const hasCompound = indexes.some((i) => isCompound(i.key));
  if (!hasCompound) {
    await collection.createIndex({ userId: 1, key: 1 }, { unique: true });
  }

  const keyOnly = indexes.find((i) => isKeyOnly(i.key));
  let droppedKeyOnly = false;
  if (keyOnly?.name) {
    try {
      await collection.dropIndex(keyOnly.name);
      droppedKeyOnly = true;
    } catch (err) {
      // A concurrent run already dropped it.
      if ((err as { code?: number }).code !== INDEX_NOT_FOUND) throw err;
    }
  }

  return { createdCompound: !hasCompound, droppedKeyOnly };
}
