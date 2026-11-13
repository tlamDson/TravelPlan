import { describe, it, expect, vi } from "vitest";

vi.mock("../../features/experiments/experiments-flag", () => ({
  isExperimentsEnabled: () => false,
}));

import request from "supertest";
import { createApp } from "../../app";
import { asUser } from "../integration-fixtures";
import AnalyticsEvent from "../../features/analytics/models/AnalyticsEvent";

const app = createApp();

describe("/api/experiments — EXPERIMENTS_ENABLED off", () => {
  it("404s (routes not mounted) and stores nothing", async () => {
    const get = await request(app)
      .get("/api/experiments/assignments")
      .set(asUser("user_1"));
    expect(get.status).toBe(404);

    const post = await request(app)
      .post("/api/experiments/exposures")
      .set(asUser("user_1"))
      .send({ experimentKey: "vector-ab", sessionId: "s" });
    expect(post.status).toBe(404);
    expect(await AnalyticsEvent.countDocuments()).toBe(0);
  });
});
