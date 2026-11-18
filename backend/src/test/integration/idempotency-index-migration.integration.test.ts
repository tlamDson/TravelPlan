import { describe, it, expect, beforeAll } from "vitest";
import mongoose from "mongoose";
import { dropKeyOnlyIdempotencyIndex } from "../../features/user/services/idempotency-index-migration";

describe("dropKeyOnlyIdempotencyIndex (real Mongo)", () => {
  const name = "idempotencylogs_migration_scratch";
  const scratch = () => mongoose.connection.collection(name);

  beforeAll(async () => {
    await scratch()
      .drop()
      .catch(() => undefined);
  });

  it("replaces a legacy key-only unique index with {userId, key}, and is idempotent", async () => {
    await scratch().createIndex({ key: 1 }, { unique: true });
    await scratch().insertOne({ key: "k", userId: "user_a" });
    // Legacy index blocks a second user's write.
    await expect(
      scratch().insertOne({ key: "k", userId: "user_b" }),
    ).rejects.toMatchObject({ code: 11000 });

    const first = await dropKeyOnlyIdempotencyIndex(scratch());
    expect(first).toEqual({ createdCompound: true, droppedKeyOnly: true });
    await expect(
      scratch().insertOne({ key: "k", userId: "user_b" }),
    ).resolves.toBeDefined();
    // Same user + same key stays unique.
    await expect(
      scratch().insertOne({ key: "k", userId: "user_b" }),
    ).rejects.toMatchObject({ code: 11000 });

    const second = await dropKeyOnlyIdempotencyIndex(scratch());
    expect(second).toEqual({ createdCompound: false, droppedKeyOnly: false });
  });

  it("does nothing on a collection that does not exist yet", async () => {
    await scratch()
      .drop()
      .catch(() => undefined);

    const result = await dropKeyOnlyIdempotencyIndex(scratch());

    expect(result.droppedKeyOnly).toBe(false);
  });
});
