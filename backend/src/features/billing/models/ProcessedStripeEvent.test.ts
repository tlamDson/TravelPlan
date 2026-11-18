import { describe, it, expect } from "vitest";
import ProcessedStripeEvent from "./ProcessedStripeEvent";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

describe("ProcessedStripeEvent model", () => {
  const indexes = ProcessedStripeEvent.schema.indexes();

  it("has a unique index on eventId", () => {
    const unique = indexes.find(([fields]) => "eventId" in fields);
    expect(unique?.[1]).toMatchObject({ unique: true });
  });

  it("expires documents after at least 30 days (Stripe retries for up to 3 days)", () => {
    const ttl = indexes.find(
      ([, opts]) => typeof opts?.expireAfterSeconds === "number",
    );
    expect(ttl?.[1].expireAfterSeconds).toBeGreaterThanOrEqual(
      THIRTY_DAYS_SECONDS,
    );
  });

  it("starts the TTL when processing succeeded (processedAt), not when a delivery arrived", () => {
    const ttl = indexes.find(
      ([, opts]) => typeof opts?.expireAfterSeconds === "number",
    );
    expect(Object.keys(ttl?.[0] ?? {})).toEqual(["processedAt"]);
    expect(ProcessedStripeEvent.schema.path("processedAt")).toBeDefined();
  });

  it("holds no in-flight claim state that a stale worker could erase", () => {
    expect(ProcessedStripeEvent.schema.path("status")).toBeUndefined();
    expect(ProcessedStripeEvent.schema.path("lockedUntil")).toBeUndefined();
  });
});
