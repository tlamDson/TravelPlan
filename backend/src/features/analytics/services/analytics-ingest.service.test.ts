import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyticsIngestResultSchema } from "@travelplan/shared";

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
  ingestEvents,
  QUARANTINE_RAW_MAX_CHARS,
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

const NOW = new Date("2026-11-13T12:00:00.000Z");

type QuarantineDoc = {
  reason: string;
  issues: Array<{ path: string }>;
  raw: string;
  rawTruncated: boolean;
  receivedAt: Date;
};
const quarantined = (): QuarantineDoc[] =>
  mockQuarantineInsert.mock.calls.flatMap((c) => c[0] as QuarantineDoc[]);

describe("ingestEvents — G-event ingest-batch golden", () => {
  beforeEach(() => {
    stored.clear();
    mockInsertNew.mockClear();
    mockQuarantineInsert.mockClear();
  });

  it("returns the hand-counted totals", async () => {
    const result = await ingestEvents(input.events, NOW);
    expect(result).toEqual(truth.expected);
    expect(analyticsIngestResultSchema.safeParse(result).success).toBe(true);
  });

  it("stores exactly the accepted events, first occurrence wins", async () => {
    await ingestEvents(input.events, NOW);
    const acceptedIds = truth.cases
      .filter((c: { outcome: string }) => c.outcome === "accepted")
      .map((c: { index: number }) => input.events[c.index].eventId);
    expect([...stored.keys()].sort()).toEqual([...acceptedIds].sort());
    // In-batch duplicates never reach the repository.
    expect(mockInsertNew).toHaveBeenCalledTimes(1);
    expect(mockInsertNew.mock.calls[0]![0]).toHaveLength(acceptedIds.length);
  });

  it("quarantines each bad event with the hand-labelled reason and issue path", async () => {
    await ingestEvents(input.events, NOW);
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
        expect(JSON.parse(doc.raw)).toEqual(input.events[c.index]);
        expect(doc.rawTruncated).toBe(false);
        expect(doc.receivedAt).toEqual(NOW);
      },
    );
  });

  it("counts a replay of the whole batch as duplicates, and quarantines the bad events again", async () => {
    await ingestEvents(input.events, NOW);
    const replay = await ingestEvents(input.events, NOW);
    expect(replay).toEqual({
      received: truth.expected.received,
      accepted: 0,
      duplicates: truth.expected.accepted + truth.expected.duplicates,
      quarantined: truth.expected.quarantined,
    });
    expect(stored.size).toBe(truth.expected.accepted);
  });
});

describe("ingestEvents — stored document shape", () => {
  beforeEach(() => {
    stored.clear();
    mockInsertNew.mockClear();
    mockQuarantineInsert.mockClear();
  });

  it("stores occurredAt as a Date, stamps receivedAt, keeps properties", async () => {
    const event = input.events[0];
    await ingestEvents([event], NOW);
    const doc = stored.get(event.eventId)!;
    expect(doc).toEqual({
      ...event,
      occurredAt: new Date(event.occurredAt),
      receivedAt: NOW,
    });
  });

  it("skips repository calls that would be empty", async () => {
    await ingestEvents([input.events[0]], NOW);
    expect(mockQuarantineInsert).not.toHaveBeenCalled();
    mockInsertNew.mockClear();
    await ingestEvents([42], NOW);
    expect(mockInsertNew).not.toHaveBeenCalled();
    expect(mockQuarantineInsert).toHaveBeenCalledTimes(1);
  });

  it("never deduplicates quarantined events, even with a repeated eventId", async () => {
    const bad = input.events[13];
    const result = await ingestEvents([bad, bad], NOW);
    expect(result).toEqual({
      received: 2,
      accepted: 0,
      duplicates: 0,
      quarantined: 2,
    });
  });

  it("truncates an oversized raw payload and flags it", async () => {
    const huge = {
      name: "trip_viewed",
      junk: "x".repeat(QUARANTINE_RAW_MAX_CHARS * 2),
    };
    await ingestEvents([huge], NOW);
    const [doc] = quarantined();
    expect(doc!.raw).toHaveLength(QUARANTINE_RAW_MAX_CHARS);
    expect(doc!.rawTruncated).toBe(true);
  });

  it("stores a null event as the JSON text 'null'", async () => {
    await ingestEvents([null], NOW);
    expect(quarantined()[0]!.raw).toBe("null");
  });
});
