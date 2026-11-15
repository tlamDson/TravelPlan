import { createHmac } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

const SECRET = "s".repeat(32);

async function load(secret: string) {
  vi.doMock("../../../config/env", () => ({
    env: { ANALYTICS_HASH_SECRET: secret },
  }));
  return import("./pseudonymize");
}

describe("pseudonymize", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("hashes a userId with HMAC-SHA256 keyed by ANALYTICS_HASH_SECRET", async () => {
    const { hashUserId } = await load(SECRET);
    const expected = createHmac("sha256", SECRET)
      .update("user_123")
      .digest("hex");
    expect(hashUserId("user_123")).toBe(expected);
    expect(hashUserId("user_123")).not.toContain("user_123");
  });

  it("is stable per user and differs between users", async () => {
    const { hashUserId } = await load(SECRET);
    expect(hashUserId("user_a")).toBe(hashUserId("user_a"));
    expect(hashUserId("user_a")).not.toBe(hashUserId("user_b"));
  });

  it("refuses to hash with a missing or short secret instead of storing a weak hash", async () => {
    const { hashUserId, assertAnalyticsHashSecret } = await load("short");
    expect(() => hashUserId("user_1")).toThrow(/ANALYTICS_HASH_SECRET/);
    expect(() => assertAnalyticsHashSecret()).toThrow(/ANALYTICS_HASH_SECRET/);
  });

  it("accepts a secret of the minimum length", async () => {
    const { assertAnalyticsHashSecret } = await load(SECRET);
    expect(() => assertAnalyticsHashSecret()).not.toThrow();
  });
});
