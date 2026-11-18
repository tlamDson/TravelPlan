import { describe, it, expect, beforeAll } from "vitest";
import IdempotencyLog from "../../features/user/models/IdempotencyLog";
import { idempotencyLogRepository as repo } from "../../features/user/repositories/idempotency-log.repository";

describe("IdempotencyLog uniqueness is scoped to {userId, key} (real Mongo)", () => {
  beforeAll(async () => {
    // A reused local DB may still hold the old key-only index; make the
    // collection's indexes match the schema exactly.
    await IdempotencyLog.syncIndexes();
  });

  it("lets two users reserve the same key", async () => {
    const a = await repo.reserve("same-key", "user_a", "tok-a");
    const b = await repo.reserve("same-key", "user_b", "tok-b");

    expect(a).toEqual({ reserved: true });
    expect(b).toEqual({ reserved: true });
  });

  it("still rejects the same user reusing a key", async () => {
    await repo.reserve("dup-key", "user_a", "tok-1");
    const again = await repo.reserve("dup-key", "user_a", "tok-2");

    expect(again.reserved).toBe(false);
  });

  it("has a compound unique {userId, key} index and no key-only unique index", async () => {
    const indexes = await IdempotencyLog.collection.indexes();
    const keys = indexes.map((i) => JSON.stringify(i.key));

    expect(
      indexes.find((i) => JSON.stringify(i.key) === '{"userId":1,"key":1}')
        ?.unique,
    ).toBe(true);
    expect(keys).not.toContain('{"key":1}');
  });
});
