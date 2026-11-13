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
    expect(doc).toEqual({
      ...event,
      userId: hash(event.userId),
      occurredAt: new Date(event.occurredAt),
      receivedAt: NOW,
    });
    expect(JSON.stringify(doc)).not.toContain(event.userId);
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
