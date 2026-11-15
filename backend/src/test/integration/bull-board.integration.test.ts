import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

const app = createApp();

describe("GET /admin/queues — Bull Board (dev-only)", () => {
  it("404s outside development — the gate, not the UI, is what's worth testing", async () => {
    // NODE_ENV is "test" in this suite (integration-setup.ts), so
    // isDevRoutesEnabled() is false and the whole /admin/queues surface
    // is never mounted — same precedent as /api/dev/toggle-pro.
    const res = await request(app).get("/admin/queues");
    expect(res.status).toBe(404);
  });
});
