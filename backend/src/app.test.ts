import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "./app";

// The real limiter is Redis-backed; this unit test needs no Redis.
vi.mock("./middlewares/rate-limiter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./middlewares/rate-limiter")>()),
  generalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe("global error handler", () => {
  it("returns the correctly spelled message on an unhandled error", async () => {
    const res = await request(createApp())
      .post("/")
      .set("Content-Type", "application/json")
      .send("{ not valid json");

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("An unexpected error occurred");
  });
});
