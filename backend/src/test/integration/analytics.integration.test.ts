import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeAll } from "vitest";

// Mocked rather than set through process.env: config/env.ts may already be
// evaluated by an earlier file in this worker (see
// reliability.integration.test.ts for the full story).
vi.mock("../../features/analytics/analytics-flag", () => ({
  isAnalyticsEnabled: () => true,
}));

import request from "supertest";
import { ANALYTICS_BATCH_MAX_EVENTS } from "@travelplan/shared";
import { createApp } from "../../app";
import { ANALYTICS_RATE_LIMIT_MAX } from "../../middlewares/rate-limiter";
import AnalyticsEvent from "../../features/analytics/models/AnalyticsEvent";
import AnalyticsQuarantine from "../../features/analytics/models/AnalyticsQuarantine";

const app = createApp();
const URL = "/api/analytics/events";

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

describe("POST /api/analytics/events — flag on", () => {
  beforeAll(async () => {
    await AnalyticsEvent.init();
    await AnalyticsQuarantine.init();
  });

  it("uses the analytics_events / analytics_quarantine collections with a unique eventId index", async () => {
    expect(AnalyticsEvent.collection.collectionName).toBe("analytics_events");
    expect(AnalyticsQuarantine.collection.collectionName).toBe(
      "analytics_quarantine",
    );
    const indexes = await AnalyticsEvent.collection.indexes();
    const byEventId = indexes.find((i) => i.key.eventId === 1);
    expect(byEventId?.unique).toBe(true);
  });

  it("ingests the G-event golden batch with the hand-counted totals, no auth needed", async () => {
    const res = await request(app).post(URL).send(input);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(truth.expected);

    expect(await AnalyticsEvent.countDocuments()).toBe(truth.expected.accepted);
    const quarantined = await AnalyticsQuarantine.find({})
      .sort({ _id: 1 })
      .lean();
    const expectedReasons = truth.cases
      .filter((c: { outcome: string }) => c.outcome === "quarantined")
      .map((c: { reason: string }) => c.reason);
    expect(quarantined.map((q) => q.reason)).toEqual(expectedReasons);
  });

  it("stores occurredAt as a Date and keeps the validated properties", async () => {
    const event = input.events[1];
    await request(app)
      .post(URL)
      .send({ events: [event] });
    const doc = await AnalyticsEvent.findOne({ eventId: event.eventId }).lean();
    expect(doc?.occurredAt).toBeInstanceOf(Date);
    expect(doc?.occurredAt.toISOString()).toBe(
      new Date(event.occurredAt).toISOString(),
    );
    expect(doc?.properties).toEqual(event.properties);
    expect(doc?.receivedAt).toBeInstanceOf(Date);
  });

  it("dedupes across requests: a client retry of the same batch stores nothing new", async () => {
    await request(app).post(URL).send(input);
    const retry = await request(app).post(URL).send(input);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({
      received: truth.expected.received,
      accepted: 0,
      duplicates: truth.expected.accepted + truth.expected.duplicates,
      quarantined: truth.expected.quarantined,
    });
    expect(await AnalyticsEvent.countDocuments()).toBe(truth.expected.accepted);
    expect(await AnalyticsQuarantine.countDocuments()).toBe(
      truth.expected.quarantined * 2,
    );
  });

  it("dedupes concurrent requests carrying the same event", async () => {
    const event = input.events[0];
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(URL)
          .send({ events: [event] }),
      ),
    );
    const accepted = results.reduce((n, r) => n + r.body.accepted, 0);
    expect(accepted).toBe(1);
    expect(await AnalyticsEvent.countDocuments()).toBe(1);
  });

  it.each([
    ["an empty batch", { events: [] }],
    ["a body without events", { foo: 1 }],
    [
      "a batch over the size cap",
      {
        events: Array.from(
          { length: ANALYTICS_BATCH_MAX_EVENTS + 1 },
          () => input.events[0],
        ),
      },
    ],
  ])("400s on %s and stores nothing", async (_label, body) => {
    const res = await request(app).post(URL).send(body);
    expect(res.status).toBe(400);
    expect(await AnalyticsEvent.countDocuments()).toBe(0);
    expect(await AnalyticsQuarantine.countDocuments()).toBe(0);
  });

  it("is metered by its own limiter, not the general one", async () => {
    const res = await request(app)
      .post(URL)
      .send({ events: [input.events[0]] });
    expect(res.headers["ratelimit-limit"]).toBe(
      String(ANALYTICS_RATE_LIMIT_MAX),
    );
  });

  it("429s once the analytics budget is exhausted", async () => {
    let last;
    for (let i = 0; i < ANALYTICS_RATE_LIMIT_MAX + 1; i++) {
      last = await request(app)
        .post(URL)
        .send({ events: [42] });
    }
    expect(last!.status).toBe(429);
  }, 30_000);
});
