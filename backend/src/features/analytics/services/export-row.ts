import { z } from "zod";
import type { IAnalyticsEvent } from "../models/AnalyticsEvent";
import { hashField, hashUserId } from "./pseudonymize";

/**
 * One line of the daily analytics export (B2 plan, PR 5), the file that
 * analytics/ (Python) reads. Dates are ISO strings, Mongo-only fields are
 * dropped.
 */
export interface AnalyticsExportRow {
  eventId: string;
  schemaVersion: number;
  name: string;
  occurredAt: string;
  receivedAt: string;
  sessionId: string;
  userId: string | null;
  source: string;
  properties: Record<string, unknown>;
}

/** Shape of every keyed hash written by pseudonymize.ts (HMAC-SHA256 hex). */
const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Anything that looks like an email, anywhere in a string. */
export const EMAIL_PATTERN = /[^\s@"]+@[^\s@"]+\.[^\s@"]+/;

function scrub(key: string, value: unknown): unknown {
  if (typeof value === "string") {
    return EMAIL_PATTERN.test(value) ? hashField(key, value) : value;
  }
  if (Array.isArray(value)) return value.map((item) => scrub(key, item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, scrub(k, v)]),
    );
  }
  return value;
}

/**
 * Ingest already stores userId, sessionId and free-string properties as
 * keyed hashes (pseudonymize-event.ts). The export does not trust that a
 * row was written by that path: an id that is not a hash is hashed here
 * with the same HMAC (so it still joins), and any string that looks like
 * an email is hashed, so no raw userId or email leaves Mongo.
 */
export function toExportRow(doc: IAnalyticsEvent): AnalyticsExportRow {
  const { userId, sessionId } = doc;
  return {
    eventId: doc.eventId,
    schemaVersion: doc.schemaVersion,
    name: doc.name,
    occurredAt: doc.occurredAt.toISOString(),
    receivedAt: doc.receivedAt.toISOString(),
    sessionId: HASH_PATTERN.test(sessionId)
      ? sessionId
      : hashField("sessionId", sessionId),
    userId:
      userId === null || HASH_PATTERN.test(userId)
        ? userId
        : hashUserId(userId),
    source: doc.source,
    properties: scrub("properties", doc.properties) as Record<string, unknown>,
  };
}

const daySchema = z.iso.date();

/** A UTC calendar day `YYYY-MM-DD`; throws on anything else. */
export function parseExportDay(day: string): string {
  if (!daySchema.safeParse(day).success) {
    throw new Error(`Export day must be a valid YYYY-MM-DD date, got "${day}"`);
  }
  return day;
}

/** Half-open UTC range [start, end) covering the day. */
export function utcDayRange(day: string): { start: Date; end: Date } {
  const start = new Date(`${parseExportDay(day)}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function exportFileName(day: string): string {
  return `events-${day}.jsonl.gz`;
}

/** The UTC day before `now`: the default day a daily run exports. */
export function previousUtcDay(now: Date): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
