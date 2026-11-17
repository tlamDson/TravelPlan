import { describe, it, expect } from "vitest";
import IdempotencyLog from "./IdempotencyLog";

describe("IdempotencyLog indexes", () => {
  it("is unique on (userId, key), not on key alone", () => {
    const indexes = IdempotencyLog.schema.indexes();
    const compound = indexes.find(
      ([fields]) =>
        JSON.stringify(fields) === JSON.stringify({ userId: 1, key: 1 }),
    );
    expect(compound?.[1]).toMatchObject({ unique: true });
    expect(IdempotencyLog.schema.path("key").options.unique).toBeUndefined();
  });

  it("lets a key be reserved before tripId/jobId exist", () => {
    const doc = new IdempotencyLog({ key: "k1", userId: "user-1" });
    expect(doc.validateSync()).toBeUndefined();
  });

  it("lives in its own collection, apart from the legacy idempotencylogs one", () => {
    // An older API revision that is still running during a deploy keeps
    // using idempotencylogs (unique on key alone, tripId required). Sharing
    // it would let that revision answer a pending reservation with a 200 and
    // no tripId, or rebuild the global key index on restart.
    expect(IdempotencyLog.collection.collectionName).toBe(
      "idempotency_reservations",
    );
  });
});
