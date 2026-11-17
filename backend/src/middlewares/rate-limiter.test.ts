import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// In-memory stand-in for the Redis-backed store: same Store contract, no
// network. Each limiter instance gets its own hit map.
vi.mock("rate-limit-redis", () => {
  class FakeStore {
    private hits = new Map<string, number>();
    private windowMs = 0;
    init(options: { windowMs: number }) {
      this.windowMs = options.windowMs;
    }
    async increment(key: string) {
      const totalHits = (this.hits.get(key) ?? 0) + 1;
      this.hits.set(key, totalHits);
      return { totalHits, resetTime: new Date(Date.now() + this.windowMs) };
    }
    async decrement(key: string) {
      this.hits.set(key, Math.max(0, (this.hits.get(key) ?? 0) - 1));
    }
    async resetKey(key: string) {
      this.hits.delete(key);
    }
  }
  return { default: FakeStore };
});

vi.mock("../lib/queue", () => ({
  redisConnection: { call: vi.fn() },
  createQueue: vi.fn(() => ({ add: vi.fn(), on: vi.fn() })),
}));

import { createApp } from "../app";
import { GENERAL_RATE_LIMIT_MAX } from "./rate-limiter";

const remaining = (res: request.Response) =>
  Number(res.headers["ratelimit-remaining"]);

describe("generalLimiter behind a reverse proxy", () => {
  const app = createApp();

  it("trusts exactly one proxy hop so req.ip is the real client", () => {
    expect(app.get("trust proxy")).toBe(1);
  });

  it("gives clients with different X-Forwarded-For addresses separate buckets", async () => {
    const first = await request(app)
      .get("/")
      .set("X-Forwarded-For", "203.0.113.10");
    const second = await request(app)
      .get("/")
      .set("X-Forwarded-For", "203.0.113.10");
    const other = await request(app)
      .get("/")
      .set("X-Forwarded-For", "198.51.100.77");

    expect(remaining(first)).toBe(GENERAL_RATE_LIMIT_MAX - 1);
    expect(remaining(second)).toBe(GENERAL_RATE_LIMIT_MAX - 2);
    // A different client must start a fresh budget, not share the first one.
    expect(remaining(other)).toBe(GENERAL_RATE_LIMIT_MAX - 1);
  });
});
