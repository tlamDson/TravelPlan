import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeAll } from "vitest";

// Mocked rather than set through process.env: config/env.ts may already be
// evaluated by an earlier file in this worker.
vi.mock("../../features/analytics/analytics-flag", () => ({
  isAnalyticsEnabled: () => true,
}));
vi.mock("../../features/analytics/sim-ingest-flag", () => ({
  isSimIngestEnabled: () => true,
  assertSimIngestAllowed: () => undefined,
}));

import request from "supertest";
import { createApp } from "../../app";
import { ANALYTICS_RATE_LIMIT_MAX } from "../../middlewares/rate-limiter";
import AnalyticsEvent from "../../features/analytics/models/AnalyticsEvent";
import AnalyticsQuarantine from "../../features/analytics/models/AnalyticsQuarantine";
import { hashUserId } from "../../features/analytics/services/pseudonymize";

const app = createApp();
const URL = "/api/analytics/sim/events";

const goldenDir = resolve(
  __dirname,
  "../../../../packages/shared/fixtures/golden-events/ingest-batch",
);
const input = JSON.parse(
  readFileSync(resolve(goldenDir, "input.json"), "utf8"),
);
const truth = JSON.parse(
  readFileSync(resolve(goldenDir, "truth.json"), "utf8"),
);
const SIM_USER = "sim-u-000001";
const asSim = (e: unknown) =>
  e !== null &&
  typeof e === "object" &&
  typeof (e as { userId?: unknown }).userId === "string"
    ? { ...e, userId: SIM_USER }
    : e;
const simEvents: unknown[] = input.events.map(asSim);

describe("POST /api/analytics/sim/events — ANALYTICS_SIM_INGEST on", () => {
  beforeAll(async () => {
    await AnalyticsEvent.init();
    await AnalyticsQuarantine.init();
  });

  it("ingests the G-event golden batch of a simulated user with the trusted totals, exposure included", async () => {
    const res = await request(app).post(URL).send({ events: simEvents });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(truth.expected);
    expect(await AnalyticsEvent.countDocuments()).toBe(truth.expected.accepted);
    expect(await AnalyticsQuarantine.countDocuments()).toBe(
      truth.expected.quarantined,
    );
    const exposure = await AnalyticsEvent.findOne({
      name: "experiment_exposure",
    }).lean();
    expect(exposure?.source).toBe("server");
    expect(exposure?.userId).toBe(hashUserId(SIM_USER));
  });

  it("counts a replay of the batch as duplicates (retry-safe)", async () => {
    await request(app).post(URL).send({ events: simEvents });
    const res = await request(app).post(URL).send({ events: simEvents });
    expect(res.body).toMatchObject({
      accepted: 0,
      duplicates: truth.expected.accepted + truth.expected.duplicates,
    });
    expect(await AnalyticsEvent.countDocuments()).toBe(truth.expected.accepted);
  });

  it("quarantines an event of a non-simulated userId", async () => {
    const res = await request(app)
      .post(URL)
      .send({ events: [input.events[0]] });
    expect(res.body).toMatchObject({ accepted: 0, quarantined: 1 });
    const doc = await AnalyticsQuarantine.findOne().lean();
    expect(doc?.reason).toBe("user_mismatch");
  });

  it("is not metered by the per-IP analytics limiter: a load driver sends from one host", async () => {
    const one = { events: [simEvents[0]] };
    for (let i = 0; i <= ANALYTICS_RATE_LIMIT_MAX; i++) {
      const res = await request(app).post(URL).send(one);
      expect(res.status).toBe(200);
    }
  });

  it("400s on a malformed batch", async () => {
    const res = await request(app).post(URL).send({ events: [] });
    expect(res.status).toBe(400);
  });
});
