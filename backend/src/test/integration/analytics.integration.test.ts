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
import { asUser } from "../integration-fixtures";
import AnalyticsEvent from "../../features/analytics/models/AnalyticsEvent";
import AnalyticsQuarantine from "../../features/analytics/models/AnalyticsQuarantine";
import { hashUserId } from "../../features/analytics/services/pseudonymize";

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
const GOLDEN_USER = "user_golden_1";
/** Golden index 9 is a source:"server" exposure — trusted path only. */
const SERVER_EXPOSURE_INDEX = 9;

type Case = { index: number; outcome: string; reason?: string };
/** Golden labels as seen over HTTP: the server-only exposure is rejected. */
const httpCases: Case[] = truth.cases.map((c: Case) =>
  c.index === SERVER_EXPOSURE_INDEX
    ? { ...c, outcome: "quarantined", reason: "wrong_source" }
    : c,
);
const count = (o: string) => httpCases.filter((c) => c.outcome === o).length;
const httpExpected = {
  received: httpCases.length,
  accepted: count("accepted"),
  duplicates: count("duplicate"),
  quarantined: count("quarantined"),
};

const post = (body: unknown, userId: string | null = GOLDEN_USER) => {
  const req = request(app).post(URL);
  return (userId ? req.set(asUser(userId)) : req).send(body as object);
};

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

  it("ingests the G-event golden batch as its signed-in user, rejecting the server-only exposure", async () => {
    expect(httpExpected.accepted).toBe(truth.expected.accepted - 1);
    const res = await post(input);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(httpExpected);

    expect(await AnalyticsEvent.countDocuments()).toBe(httpExpected.accepted);
    expect(
      await AnalyticsEvent.countDocuments({ name: "experiment_exposure" }),
    ).toBe(0);
    const quarantined = await AnalyticsQuarantine.find({})
      .sort({ _id: 1 })
      .lean();
    expect(quarantined.map((q) => q.reason)).toEqual(
      httpCases.filter((c) => c.outcome === "quarantined").map((c) => c.reason),
    );
  });

  it("never persists the raw Clerk userId or the raw quarantined payload", async () => {
    await post(input);
    const events = await AnalyticsEvent.find({}).lean();
    expect(events.every((e) => e.userId === hashUserId(GOLDEN_USER))).toBe(
      true,
    );
    const quarantine = await AnalyticsQuarantine.find({}).lean();
    const text = JSON.stringify([events, quarantine]);
    expect(text).not.toContain(GOLDEN_USER);
    expect(quarantine.every((q) => !("raw" in q))).toBe(true);
  });

  it("quarantines events that claim another user's id", async () => {
    const res = await post({ events: [input.events[0]] }, "user_attacker");
    expect(res.body).toMatchObject({ accepted: 0, quarantined: 1 });
    const [q] = await AnalyticsQuarantine.find({}).lean();
    expect(q?.reason).toBe("user_mismatch");
    expect(await AnalyticsEvent.countDocuments()).toBe(0);
  });

  it("accepts anonymous events without a session, but not a claimed userId", async () => {
    const anon = { ...input.events[0], userId: null };
    const ok = await post({ events: [anon] }, null);
    expect(ok.body).toMatchObject({ accepted: 1, quarantined: 0 });
    const claimed = await post({ events: [input.events[1]] }, null);
    expect(claimed.body).toMatchObject({ accepted: 0, quarantined: 1 });
  });

  it("stores occurredAt as a Date and keeps the validated properties", async () => {
    const event = input.events[1];
    await post({ events: [event] });
    const doc = await AnalyticsEvent.findOne({ eventId: event.eventId }).lean();
    expect(doc?.occurredAt).toBeInstanceOf(Date);
    expect(doc?.occurredAt.toISOString()).toBe(
      new Date(event.occurredAt).toISOString(),
    );
    expect(doc?.properties).toEqual(event.properties);
    expect(doc?.receivedAt).toBeInstanceOf(Date);
  });

  it("dedupes across requests: a client retry of the same batch stores nothing new", async () => {
    await post(input);
    const retry = await post(input);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({
      received: httpExpected.received,
      accepted: 0,
      duplicates: httpExpected.accepted + httpExpected.duplicates,
      quarantined: httpExpected.quarantined,
    });
    expect(await AnalyticsEvent.countDocuments()).toBe(httpExpected.accepted);
    expect(await AnalyticsQuarantine.countDocuments()).toBe(
      httpExpected.quarantined * 2,
    );
  });

  it("dedupes concurrent requests carrying the same event", async () => {
    const event = input.events[0];
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post({ events: [event] })),
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
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await AnalyticsEvent.countDocuments()).toBe(0);
    expect(await AnalyticsQuarantine.countDocuments()).toBe(0);
  });

  it("is metered by its own limiter, not the general one", async () => {
    const res = await post({ events: [input.events[0]] });
    expect(res.headers["ratelimit-limit"]).toBe(
      String(ANALYTICS_RATE_LIMIT_MAX),
    );
  });

  it("429s once the analytics budget is exhausted", async () => {
    let last;
    for (let i = 0; i < ANALYTICS_RATE_LIMIT_MAX + 1; i++) {
      last = await post({ events: [42] }, null);
    }
    expect(last!.status).toBe(429);
  }, 30_000);
});
