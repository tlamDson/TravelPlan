import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../config/env", () => ({
  env: { ANALYTICS_HASH_SECRET: "test-analytics-hash-secret-32-chars!" },
}));
const stream = vi.hoisted(() => vi.fn());
vi.mock("../repositories/analytics-event.repository", () => ({
  analyticsEventRepository: { streamOccurredBetween: stream },
}));

import type { IAnalyticsEvent } from "../models/AnalyticsEvent";
import { exportAnalyticsDay } from "./analytics-export.service";
import { EMAIL_PATTERN } from "./export-row";

function event(id: string, iso: string, userId: string | null) {
  return {
    eventId: id,
    schemaVersion: 1,
    name: "trip_viewed",
    occurredAt: new Date(iso),
    receivedAt: new Date(iso),
    sessionId: "f".repeat(64),
    userId,
    source: "web",
    properties: { tripId: "e".repeat(64) },
  } as IAnalyticsEvent;
}

async function* yieldAll(docs: IAnalyticsEvent[]) {
  for (const d of docs) yield d;
}

function readRows(file: string) {
  return gunzipSync(readFileSync(file))
    .toString("utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line));
}

describe("exportAnalyticsDay", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "analytics-export-"));
    stream.mockReset();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("queries the UTC day range and writes one JSON line per event", async () => {
    stream.mockReturnValue(
      yieldAll([
        event("id-1", "2026-11-02T00:00:00Z", "a".repeat(64)),
        event("id-2", "2026-11-02T23:59:59Z", null),
      ]),
    );
    const out = join(dir, "nested", "events");
    const result = await exportAnalyticsDay("2026-11-02", out);

    expect(stream).toHaveBeenCalledWith(
      new Date("2026-11-02T00:00:00.000Z"),
      new Date("2026-11-03T00:00:00.000Z"),
    );
    expect(result).toEqual({
      day: "2026-11-02",
      file: join(out, "events-2026-11-02.jsonl.gz"),
      count: 2,
    });
    const rows = readRows(result.file);
    expect(rows.map((r) => r.eventId)).toEqual(["id-1", "id-2"]);
    expect(rows[0].occurredAt).toBe("2026-11-02T00:00:00.000Z");
    expect(rows[1].userId).toBeNull();
  });

  it("hashes a raw email userId so the file holds no raw email", async () => {
    stream.mockReturnValue(
      yieldAll([event("id-1", "2026-11-02T10:00:00Z", "someone@example.com")]),
    );
    const { file } = await exportAnalyticsDay("2026-11-02", dir);
    const text = gunzipSync(readFileSync(file)).toString("utf8");
    expect(text).not.toMatch(EMAIL_PATTERN);
    expect(text).not.toContain("someone@example.com");
  });

  it("writes an empty file for a day without events, leaving no temp file", async () => {
    stream.mockReturnValue(yieldAll([]));
    const result = await exportAnalyticsDay("2026-11-05", dir);
    expect(result.count).toBe(0);
    expect(readRows(result.file)).toEqual([]);
    expect(readdirSync(dir)).toEqual(["events-2026-11-05.jsonl.gz"]);
  });

  it("produces byte-identical files for the same events", async () => {
    const docs = [event("id-1", "2026-11-02T10:00:00Z", "a".repeat(64))];
    stream.mockReturnValueOnce(yieldAll(docs));
    const first = readFileSync(
      (await exportAnalyticsDay("2026-11-02", join(dir, "a"))).file,
    );
    stream.mockReturnValueOnce(yieldAll(docs));
    const second = readFileSync(
      (await exportAnalyticsDay("2026-11-02", join(dir, "b"))).file,
    );
    expect(first.equals(second)).toBe(true);
  });

  it("propagates a mid-stream failure, removes the temp file and keeps the previous export", async () => {
    stream.mockReturnValueOnce(
      yieldAll([event("id-old", "2026-11-02T08:00:00Z", null)]),
    );
    const { file } = await exportAnalyticsDay("2026-11-02", dir);
    const previous = readFileSync(file);

    async function* failing() {
      yield event("id-1", "2026-11-02T10:00:00Z", null);
      throw new Error("cursor lost");
    }
    stream.mockReturnValueOnce(failing());
    await expect(exportAnalyticsDay("2026-11-02", dir)).rejects.toThrow(
      "cursor lost",
    );

    expect(readdirSync(dir)).toEqual(["events-2026-11-02.jsonl.gz"]);
    expect(readFileSync(file).equals(previous)).toBe(true);
  });

  it("writes no file when the first read fails", async () => {
    const failing: AsyncIterable<IAnalyticsEvent> = {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error("connection refused")),
      }),
    };
    stream.mockReturnValueOnce(failing);
    await expect(exportAnalyticsDay("2026-11-02", dir)).rejects.toThrow(
      "connection refused",
    );
    expect(readdirSync(dir)).toEqual([]);
  });

  it("rejects an invalid day before touching the database", async () => {
    await expect(exportAnalyticsDay("2026-13-01", dir)).rejects.toThrow(
      /YYYY-MM-DD/,
    );
    expect(stream).not.toHaveBeenCalled();
  });
});
