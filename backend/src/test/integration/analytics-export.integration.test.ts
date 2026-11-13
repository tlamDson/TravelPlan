import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import AnalyticsEvent from "../../features/analytics/models/AnalyticsEvent";
import { ingestTrustedEvents } from "../../features/analytics/services/analytics-ingest.service";
import { exportAnalyticsDay } from "../../features/analytics/services/analytics-export.service";
import { EMAIL_PATTERN } from "../../features/analytics/services/export-row";
import { hashUserId } from "../../features/analytics/services/pseudonymize";

const goldenDir = resolve(
  __dirname,
  "../../../../packages/shared/fixtures/golden-events/dau-funnel",
);
const golden = JSON.parse(
  readFileSync(resolve(goldenDir, "events.json"), "utf8"),
);
const truth = JSON.parse(
  readFileSync(resolve(goldenDir, "truth.json"), "utf8"),
);

function readFile(file: string): { text: string; rows: any[] } {
  const text = gunzipSync(readFileSync(file)).toString("utf8");
  const rows = text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line));
  return { text, rows };
}

describe("analytics daily export (Mongo → JSONL.gz)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "analytics-export-it-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("exports the G-event dau-funnel log so per-day DAU matches the hand-computed truth", async () => {
    const result = await ingestTrustedEvents(golden.events);
    expect(result.accepted).toBe(golden.events.length);

    const dau: Record<string, number> = {};
    let exported = 0;
    for (const day of Object.keys(truth.expected.dau)) {
      const { file, count } = await exportAnalyticsDay(day, dir);
      const { text, rows } = readFile(file);
      expect(rows).toHaveLength(count);
      exported += count;
      for (const row of rows) {
        expect(row.occurredAt.slice(0, 10)).toBe(day);
      }
      dau[day] = new Set(
        rows.map((r) => r.userId).filter((u) => u !== null),
      ).size;
      for (const raw of ["user_a", "user_b", "user_c", "user_d", "sess-a1"]) {
        expect(text).not.toContain(`"${raw}"`);
      }
    }
    expect(dau).toEqual(truth.expected.dau);
    expect(exported).toBe(golden.events.length);
  });

  it("hashes a raw userId and emails left in stored rows; no raw email reaches the file", async () => {
    await AnalyticsEvent.collection.insertOne({
      eventId: "0b7c6f0e-0000-4000-8000-0000000009aa",
      schemaVersion: 1,
      name: "trip_viewed",
      occurredAt: new Date("2026-11-04T12:00:00Z"),
      receivedAt: new Date("2026-11-04T12:00:01Z"),
      sessionId: "someone@example.com",
      userId: "user_legacy_raw",
      source: "web",
      properties: { tripId: "owner.name@example.org" },
    });

    const { file, count } = await exportAnalyticsDay("2026-11-04", dir);
    const { text, rows } = readFile(file);

    expect(count).toBe(1);
    expect(text).not.toMatch(EMAIL_PATTERN);
    expect(text).not.toContain("user_legacy_raw");
    expect(rows[0].userId).toBe(hashUserId("user_legacy_raw"));
    expect(rows[0]).not.toHaveProperty("_id");
  });
});
