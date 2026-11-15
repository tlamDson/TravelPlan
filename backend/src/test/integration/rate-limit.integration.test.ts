import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import {
  GENERAL_RATE_LIMIT_MAX,
  JOB_STATUS_RATE_LIMIT_MAX,
} from "../../middlewares/rate-limiter";
import { asUser } from "../integration-fixtures";

const app = createApp();

describe("generalLimiter — mounted globally", () => {
  it("attaches standard RateLimit-* headers on a normal route", async () => {
    // standardHeaders: true resolves to the draft-6 header set:
    // RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset.
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-limit"]).toBeDefined();
    expect(res.headers["ratelimit-remaining"]).toBeDefined();
  });

  it("does NOT attach RateLimit-* headers on /health (liveness probe)", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-limit"]).toBeUndefined();
  });

  it("does NOT attach RateLimit-* headers on /ready (readiness probe)", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-limit"]).toBeUndefined();
  });

  it("returns 429 once the window's request budget is exhausted", async () => {
    let lastRes;
    for (let i = 0; i < GENERAL_RATE_LIMIT_MAX + 1; i++) {
      lastRes = await request(app).get("/");
    }
    expect(lastRes!.status).toBe(429);
    expect(lastRes!.body.error).toMatch(/too many requests/i);
  }, 20_000);
});

describe("job status polling — own limiter, outside the general budget", () => {
  it("a full generation's worth of polls leaves normal requests under the general limit", async () => {
    // More polls than the whole general budget — a long generation at the
    // poller's fastest rate. None of them may spend the general budget.
    for (let i = 0; i < GENERAL_RATE_LIMIT_MAX + 1; i++) {
      const poll = await request(app)
        .get("/api/jobs/does-not-exist-999")
        .set(asUser("poller-1"));
      expect(poll.status).toBe(404);
    }

    const normal = await request(app).get("/");
    expect(normal.status).toBe(200);
    expect(Number(normal.headers["ratelimit-remaining"])).toBe(
      GENERAL_RATE_LIMIT_MAX - 1,
    );
  }, 60_000);

  it("still 429s job polls once the job status budget is exhausted", async () => {
    let last;
    for (let i = 0; i < JOB_STATUS_RATE_LIMIT_MAX + 1; i++) {
      last = await request(app)
        .get("/api/jobs/does-not-exist-999")
        .set(asUser("poller-2"));
    }
    expect(last!.status).toBe(429);
  }, 120_000);
});
