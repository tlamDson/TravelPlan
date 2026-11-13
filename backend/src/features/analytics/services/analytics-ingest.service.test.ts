import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyticsIngestResultSchema } from "@travelplan/shared";

const SECRET = "test-analytics-hash-secret-32-chars!";
vi.mock("../../../config/env", () => ({
  env: { ANALYTICS_HASH_SECRET: "test-analytics-hash-secret-32-chars!" },
}));
const hash = (id: string) =>
  createHmac("sha256", SECRET).update(id).digest("hex");

// In-memory stand-in for the unique eventId index: insertNew() stores only
// ids it has not seen and reports how many were new.
const stored = new Map<string, Record<string, unknown>>();
const mockInsertNew = vi.fn(async (docs: Array<{ eventId: string }>) => {
  let inserted = 0;
  for (const d of docs) {
    if (stored.has(d.eventId)) continue;
    stored.set(d.eventId, d);
    inserted++;
  }
  return inserted;
});
vi.mock("../repositories/analytics-event.repository", () => ({
  analyticsEventRepository: {
    insertNew: (docs: Array<{ eventId: string }>) => mockInsertNew(docs),
  },
}));

const mockQuarantineInsert = vi.fn(async (_docs: unknown[]) => undefined);
vi.mock("../repositories/analytics-quarantine.repository", () => ({
  analyticsQuarantineRepository: {
    insertMany: (docs: unknown[]) => mockQuarantineInsert(docs),
  },
}));

import {
  ingestClientEvents,
  ingestSimulatedEvents,
  ingestTrustedEvents,
} from "./analytics-ingest.service";

const goldenDir = resolve(
  __dirname,
  "../../../../../packages/shared/fixtures/golden-events/ingest-batch",
);
const input = JSON.parse(
  readFileSync(resolve(goldenDir, "input.json"), "utf8"),
);
const truth = JSON.parse(
  readFileSync(resolve(goldenDir, "truth.json"), "utf8"),
);
const GOLDEN_USER = "user_golden_1";
/** Index of the server-sourced exposure in the golden batch. */
const SERVER_EXPOSURE_INDEX = 9;

const NOW = new Date("2026-11-13T12:00:00.000Z");

type QuarantineDoc = Record<string, unknown> & {
  reason: string;
  issues: Array<{ path: string }>;
};
const quarantined = (): QuarantineDoc[] =>
  mockQuarantineInsert.mock.calls.flatMap((c) => c[0] as QuarantineDoc[]);

beforeEach(() => {
  stored.clear();
  mockInsertNew.mockClear();
  mockQuarantineInsert.mockClear();
});

describe("ingestTrustedEvents — G-event ingest-batch golden", () => {
  it("returns the hand-counted totals", async () => {
    const result = await ingestTrustedEvents(input.events, NOW);
    expect(result).toEqual(truth.expected);
    expect(analyticsIngestResultSchema.safeParse(result).success).toBe(true);
  });

  it("stores exactly the accepted events, first occurrence wins", async () => {
    await ingestTrustedEvents(input.events, NOW);
    const acceptedIds = truth.cases
      .filter((c: { outcome: string }) => c.outcome === "accepted")
      .map((c: { index: number }) => input.events[c.index].eventId);
    expect([...stored.keys()].sort()).toEqual([...acceptedIds].sort());
    // In-batch duplicates never reach the repository.
    expect(mockInsertNew).toHaveBeenCalledTimes(1);
    expect(mockInsertNew.mock.calls[0]![0]).toHaveLength(acceptedIds.length);
  });

  it("quarantines each bad event with the hand-labelled reason and issue path", async () => {
    await ingestTrustedEvents(input.events, NOW);
    const expected = truth.cases.filter(
      (c: { outcome: string }) => c.outcome === "quarantined",
    );
    const docs = quarantined();
    expect(docs).toHaveLength(expected.length);
    expected.forEach(
      (c: { index: number; reason: string; issuePath: string }, k: number) => {
        const doc = docs[k]!;
        expect(doc.reason, `case ${c.index}`).toBe(c.reason);
        expect(doc.issues.map((i) => i.path)).toContain(c.issuePath);
        expect(doc.receivedAt).toEqual(NOW);
      },
    );
  });

  it("counts a replay of the whole batch as duplicates, and quarantines the bad events again", async () => {
    await ingestTrustedEvents(input.events, NOW);
    const replay = await ingestTrustedEvents(input.events, NOW);
    expect(replay).toEqual({
      received: truth.expected.received,
      accepted: 0,
      duplicates: truth.expected.accepted + truth.expected.duplicates,
      quarantined: truth.expected.quarantined,
    });
    expect(stored.size).toBe(truth.expected.accepted);
  });
});

describe("PII — nothing raw reaches the analytics collections", () => {
  it("stores the HMAC of userId, never the raw Clerk id", async () => {
    const event = input.events[0];
    await ingestTrustedEvents([event], NOW);
    const doc = stored.get(event.eventId)!;
    expect(doc).toMatchObject({
      eventId: event.eventId,
      name: event.name,
      source: event.source,
      schemaVersion: event.schemaVersion,
      userId: hash(event.userId),
      occurredAt: new Date(event.occurredAt),
      receivedAt: NOW,
    });
    expect(JSON.stringify(doc)).not.toContain(event.userId);
  });

  it("stores no client-chosen free string of an accepted event: sessionId and id properties are hashed", async () => {
    const pii = ["someone@example.com", "0912345678", "Bob Smith"];
    const base = {
      ...input.events[0],
      userId: null,
      sessionId: "someone@example.com",
    };
    const events = [
      {
        ...base,
        eventId: "11111111-1111-4111-8111-111111111111",
        name: "trip_viewed",
        properties: { tripId: "Bob Smith" },
      },
      {
        ...base,
        eventId: "22222222-2222-4222-8222-222222222222",
        name: "trip_generation_requested",
        properties: {
          jobId: "0912345678",
          durationDays: 3,
          destinationCount: 2,
        },
      },
    ];
    const result = await ingestClientEvents(events, null, NOW);
    expect(result).toMatchObject({ accepted: 2, quarantined: 0 });
    const docs = [...stored.values()];
    const text = JSON.stringify(docs);
    for (const needle of pii) expect(text).not.toContain(needle);
    expect(docs[0]).toMatchObject({
      sessionId: hash("sessionId:someone@example.com"),
      properties: { tripId: hash("tripId:Bob Smith") },
    });
    expect(docs[1]).toMatchObject({
      sessionId: hash("sessionId:someone@example.com"),
      properties: {
        jobId: hash("jobId:0912345678"),
        durationDays: 3,
        destinationCount: 2,
      },
    });
  });

  it("keeps an anonymous userId as null", async () => {
    const event = { ...input.events[0], userId: null };
    await ingestTrustedEvents([event], NOW);
    expect(stored.get(event.eventId)!.userId).toBeNull();
  });

  it("does not keep the raw payload of a quarantined event, only safe identifiers and a hashed userId", async () => {
    const leaky = {
      ...input.events[6],
      properties: { email: "someone@example.com", note: "free text" },
    };
    await ingestTrustedEvents([leaky], NOW);
    const [doc] = quarantined();
    expect(doc).toEqual({
      reason: expect.any(String),
      issues: expect.any(Array),
      eventId: leaky.eventId,
      eventName: leaky.name,
      userIdHash: hash(leaky.userId),
      receivedAt: NOW,
    });
    const text = JSON.stringify(doc);
    expect(text).not.toContain("someone@example.com");
    expect(text).not.toContain("free text");
    expect(text).not.toContain(leaky.userId);
  });

  it("drops identifiers of a quarantined event that are not id-shaped", async () => {
    await ingestTrustedEvents(
      [{ eventId: "a@b.com", name: "Hi Bob <b@x.io>", userId: 7 }],
      NOW,
    );
    expect(quarantined()[0]).toMatchObject({
      eventId: null,
      eventName: null,
      userIdHash: null,
    });
  });

  it("keeps a quarantined eventId only when it is a UUID and a name only when it is in the catalog", async () => {
    await ingestTrustedEvents(
      [{ ...input.events[0], eventId: "0912345678", name: "john_doe" }],
      NOW,
    );
    const [doc] = quarantined();
    expect(doc).toMatchObject({ eventId: null, eventName: null });
    const text = JSON.stringify(doc);
    expect(text).not.toContain("0912345678");
    expect(text).not.toContain("john_doe");
  });

  it("stores no client-supplied string in quarantine issues: unknown keys and bad values are not echoed", async () => {
    const pii = ["someone@example.com", "user_2abcDEF", "Bob Smith", "+84912"];
    await ingestTrustedEvents(
      [
        {
          ...input.events[0],
          "someone@example.com": "Bob Smith",
          source: "+84912",
          sessionId: { user_2abcDEF: "Bob Smith" },
          properties: { user_2abcDEF: "someone@example.com" },
        },
        { ...input.events[0], name: "Bob Smith" },
        { "someone@example.com": { user_2abcDEF: ["+84912"] } },
        "Bob Smith",
      ],
      NOW,
    );
    const docs = quarantined();
    expect(docs).toHaveLength(4);
    for (const doc of docs) {
      const text = JSON.stringify(doc);
      for (const needle of pii) expect(text).not.toContain(needle);
      for (const issue of doc.issues) {
        expect(Object.keys(issue).sort()).toEqual(["code", "path"]);
      }
    }
  });

  it("handles a non-object event", async () => {
    await ingestTrustedEvents([null, 42], NOW);
    expect(quarantined().map((d) => d.eventName)).toEqual([null, null]);
  });
});

describe("ingestTrustedEvents — batching", () => {
  it("skips repository calls that would be empty", async () => {
    await ingestTrustedEvents([input.events[0]], NOW);
    expect(mockQuarantineInsert).not.toHaveBeenCalled();
    mockInsertNew.mockClear();
    await ingestTrustedEvents([42], NOW);
    expect(mockInsertNew).not.toHaveBeenCalled();
    expect(mockQuarantineInsert).toHaveBeenCalledTimes(1);
  });

  it("never deduplicates quarantined events, even with a repeated eventId", async () => {
    const bad = input.events[13];
    const result = await ingestTrustedEvents([bad, bad], NOW);
    expect(result).toEqual({
      received: 2,
      accepted: 0,
      duplicates: 0,
      quarantined: 2,
    });
  });
});

describe("ingestClientEvents — HTTP channel cannot spoof", () => {
  it("quarantines the server-only exposure in the golden batch, rest as hand-counted", async () => {
    const result = await ingestClientEvents(input.events, GOLDEN_USER, NOW);
    expect(result).toEqual({
      received: truth.expected.received,
      accepted: truth.expected.accepted - 1,
      duplicates: truth.expected.duplicates,
      quarantined: truth.expected.quarantined + 1,
    });
    const exposureId = input.events[SERVER_EXPOSURE_INDEX].eventId;
    expect(stored.has(exposureId)).toBe(false);
    expect(quarantined().find((d) => d.eventId === exposureId)?.reason).toBe(
      "wrong_source",
    );
  });

  it("quarantines events claiming another user's id as user_mismatch", async () => {
    const result = await ingestClientEvents(
      [input.events[0], input.events[1]],
      "user_attacker",
      NOW,
    );
    expect(result).toMatchObject({ accepted: 0, quarantined: 2 });
    expect(quarantined().map((d) => d.reason)).toEqual([
      "user_mismatch",
      "user_mismatch",
    ]);
    expect(stored.size).toBe(0);
  });

  it("quarantines a claimed userId on an anonymous request", async () => {
    const result = await ingestClientEvents([input.events[0]], null, NOW);
    expect(result).toMatchObject({ accepted: 0, quarantined: 1 });
  });

  it("accepts anonymous events on an anonymous request", async () => {
    const event = { ...input.events[0], userId: null };
    const result = await ingestClientEvents([event], null, NOW);
    expect(result).toMatchObject({ accepted: 1, quarantined: 0 });
  });

  it("a policy-quarantined event does not make a later copy count as a duplicate", async () => {
    const spoof = input.events[0];
    const anon = { ...input.events[0], userId: null };
    const result = await ingestClientEvents([spoof, anon], null, NOW);
    expect(result).toEqual({
      received: 2,
      accepted: 1,
      duplicates: 0,
      quarantined: 1,
    });
  });
});

describe("ingestSimulatedEvents — simkit load driver channel", () => {
  const sim = (i: number, over: Record<string, unknown> = {}) => ({
    ...input.events[i],
    userId: "sim-u-000001",
    ...over,
  });

  it("accepts simulated users' events, including the server-sourced exposure", async () => {
    const events = [sim(0), sim(SERVER_EXPOSURE_INDEX)];
    const result = await ingestSimulatedEvents(events, NOW);
    expect(result).toEqual({
      received: 2,
      accepted: 2,
      duplicates: 0,
      quarantined: 0,
    });
    expect(stored.get(events[1].eventId)?.userId).toBe(hash("sim-u-000001"));
  });

  it("quarantines a real-looking userId as user_mismatch", async () => {
    const result = await ingestSimulatedEvents([input.events[0]], NOW);
    expect(result).toMatchObject({ accepted: 0, quarantined: 1 });
    expect(quarantined()[0]).toMatchObject({
      reason: "user_mismatch",
      issues: [{ path: "userId", code: "not_simulated" }],
    });
  });

  it("keeps the G-event rules: schema-bad events quarantined, repeats counted as duplicates", async () => {
    const events = input.events.map((e: Record<string, unknown>) =>
      typeof e === "object" && e !== null && typeof e.userId === "string"
        ? { ...e, userId: "sim-u-000001" }
        : e,
    );
    const result = await ingestSimulatedEvents(events, NOW);
    expect(result).toEqual(truth.expected);
  });
});
