import { createHmac } from "node:crypto";
import { describe, it, expect, vi } from "vitest";

const SECRET = "test-analytics-hash-secret-32-chars!";
vi.mock("../../../config/env", () => ({
  env: { ANALYTICS_HASH_SECRET: "test-analytics-hash-secret-32-chars!" },
}));
const hmac = (text: string) =>
  createHmac("sha256", SECRET).update(text).digest("hex");

import type { IAnalyticsEvent } from "../models/AnalyticsEvent";
import {
  EMAIL_PATTERN,
  exportFileName,
  parseExportDay,
  previousUtcDay,
  toExportRow,
  utcDayRange,
} from "./export-row";

const HASHED_USER = hmac("user_2abc");
const HASHED_SESSION = hmac("sessionId:sess-1");

function doc(overrides: Partial<IAnalyticsEvent> = {}): IAnalyticsEvent {
  return {
    eventId: "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f",
    schemaVersion: 1,
    name: "trip_saved",
    occurredAt: new Date("2026-11-01T10:00:00.000Z"),
    receivedAt: new Date("2026-11-01T10:00:01.000Z"),
    sessionId: HASHED_SESSION,
    userId: HASHED_USER,
    source: "web",
    properties: { tripId: hmac("tripId:trip-1") },
    ...overrides,
  } as IAnalyticsEvent;
}

describe("toExportRow", () => {
  it("keeps already-hashed ids and writes dates as ISO strings", () => {
    expect(toExportRow(doc())).toEqual({
      eventId: "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f",
      schemaVersion: 1,
      name: "trip_saved",
      occurredAt: "2026-11-01T10:00:00.000Z",
      receivedAt: "2026-11-01T10:00:01.000Z",
      sessionId: HASHED_SESSION,
      userId: HASHED_USER,
      source: "web",
      properties: { tripId: hmac("tripId:trip-1") },
    });
  });

  it("drops Mongo-only fields such as _id", () => {
    const row = toExportRow({ ...doc(), _id: "abc" } as IAnalyticsEvent);
    expect(row).not.toHaveProperty("_id");
  });

  it("hashes a raw userId with the same HMAC the ingest uses", () => {
    expect(toExportRow(doc({ userId: "user_2abc" })).userId).toBe(HASHED_USER);
  });

  it("hashes a raw sessionId the same way ingest does", () => {
    expect(toExportRow(doc({ sessionId: "sess-1" })).sessionId).toBe(
      HASHED_SESSION,
    );
  });

  it("keeps an anonymous userId null", () => {
    expect(toExportRow(doc({ userId: null })).userId).toBeNull();
  });

  it("hashes an email stored as userId, sessionId or a property", () => {
    const row = toExportRow(
      doc({
        userId: "someone@example.com",
        sessionId: "Other.Person@mail.example.org",
        properties: {
          tripId: "a@b.co",
          nested: { contact: "x+y@z.io", list: ["w@v.uk"] },
          outcome: "completed",
          durationMs: 5,
        },
      }),
    );
    const text = JSON.stringify(row);
    expect(text).not.toMatch(EMAIL_PATTERN);
    expect(row.userId).toBe(hmac("someone@example.com"));
    expect(row.properties).toEqual({
      tripId: hmac("tripId:a@b.co"),
      nested: {
        contact: hmac("contact:x+y@z.io"),
        list: [hmac("list:w@v.uk")],
      },
      outcome: "completed",
      durationMs: 5,
    });
  });
});

describe("EMAIL_PATTERN", () => {
  it("matches emails and not 64-char hex hashes or slugs", () => {
    expect("someone@example.com").toMatch(EMAIL_PATTERN);
    expect("text before a@b.co after").toMatch(EMAIL_PATTERN);
    expect(HASHED_USER).not.toMatch(EMAIL_PATTERN);
    expect("save-trip-cta-v1").not.toMatch(EMAIL_PATTERN);
  });
});

describe("day helpers", () => {
  it("parses a valid YYYY-MM-DD day", () => {
    expect(parseExportDay("2026-11-02")).toBe("2026-11-02");
  });

  it.each(["2026-1-02", "2026-02-30", "yesterday", "2026-11-02T00:00Z", ""])(
    "rejects %j",
    (day) => {
      expect(() => parseExportDay(day)).toThrow(/YYYY-MM-DD/);
    },
  );

  it("maps a day to the UTC half-open range [start, next start)", () => {
    expect(utcDayRange("2026-11-02")).toEqual({
      start: new Date("2026-11-02T00:00:00.000Z"),
      end: new Date("2026-11-03T00:00:00.000Z"),
    });
  });

  it("names the file after the day", () => {
    expect(exportFileName("2026-11-02")).toBe("events-2026-11-02.jsonl.gz");
  });

  it("gives the previous UTC calendar day", () => {
    expect(previousUtcDay(new Date("2026-11-03T00:30:00+07:00"))).toBe(
      "2026-11-01",
    );
    expect(previousUtcDay(new Date("2026-01-01T12:00:00Z"))).toBe("2025-12-31");
  });
});
