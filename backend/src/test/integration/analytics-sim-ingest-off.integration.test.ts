import { describe, it, expect, vi } from "vitest";

vi.mock("../../features/analytics/analytics-flag", () => ({
  isAnalyticsEnabled: () => true,
}));
vi.mock("../../features/analytics/sim-ingest-flag", () => ({
  isSimIngestEnabled: () => false,
  assertSimIngestAllowed: () => undefined,
}));

import request from "supertest";
import { createApp } from "../../app";
import AnalyticsEvent from "../../features/analytics/models/AnalyticsEvent";

const app = createApp();

describe("POST /api/analytics/sim/events — ANALYTICS_SIM_INGEST off", () => {
  it("404s (route not mounted) and stores nothing, while the client route stays up", async () => {
    const res = await request(app)
      .post("/api/analytics/sim/events")
      .send({ events: [{}] });
    expect(res.status).toBe(404);
    expect(await AnalyticsEvent.countDocuments()).toBe(0);
    const client = await request(app)
      .post("/api/analytics/events")
      .send({ events: [] });
    expect(client.status).toBe(400);
  });
});
