import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

const app = createApp();

describe("GET /api/reliability/slo — flag off (default env)", () => {
  it("404s — the route isn't mounted at all, not merely unauthorized", async () => {
    // ENABLE_RELIABILITY_API is unset by default in the integration test
    // env (integration-setup.ts never sets it) — matches the "off
    // everywhere including local dev" default the flag is designed for.
    const res = await request(app).get("/api/reliability/slo");
    expect(res.status).toBe(404);
  });
});
