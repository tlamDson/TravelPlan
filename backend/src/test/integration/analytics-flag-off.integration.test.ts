import { describe, it, expect, vi } from "vitest";

vi.mock("../../features/analytics/analytics-flag", () => ({
  isAnalyticsEnabled: () => false,
}));

import request from "supertest";
import { createApp } from "../../app";
import AnalyticsEvent from "../../features/analytics/models/AnalyticsEvent";

const app = createApp();

describe("POST /api/analytics/events — ANALYTICS_ENABLED off", () => {
  it("404s (route not mounted) and stores nothing", async () => {
    const res = await request(app)
      .post("/api/analytics/events")
      .send({ events: [{}] });
    expect(res.status).toBe(404);
    expect(await AnalyticsEvent.countDocuments()).toBe(0);
  });
});
