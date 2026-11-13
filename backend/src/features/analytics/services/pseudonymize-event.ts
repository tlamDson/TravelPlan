import { z } from "zod";
import {
  analyticsEventSchema,
  type AnalyticsEvent,
  type AnalyticsEventName,
} from "@travelplan/shared";
import { hashField, hashUserId } from "./pseudonymize";

/**
 * String properties stored as sent. Everything else that is a free string
 * is hashed, so a property added to the catalog later is hashed by default.
 * Only slugs on events the server writes itself belong here (the HTTP
 * endpoint rejects `source: "server"`); pseudonymize-event.test.ts checks
 * that.
 */
export const READABLE_STRING_PROPERTIES: Partial<
  Record<AnalyticsEventName, readonly string[]>
> = {
  experiment_exposure: ["experimentKey", "variant"],
};

function isClosedSet(schema: unknown): boolean {
  return schema instanceof z.ZodEnum || schema instanceof z.ZodLiteral;
}

/** Per event name: the property keys whose values are stored as sent. */
const READABLE_KEYS = new Map<string, ReadonlySet<string>>(
  analyticsEventSchema.options.map((option) => {
    const name = option.shape.name.value;
    const closed = Object.entries(option.shape.properties.shape)
      .filter(([, schema]) => isClosedSet(schema))
      .map(([key]) => key);
    return [
      name,
      new Set([...closed, ...(READABLE_STRING_PROPERTIES[name] ?? [])]),
    ];
  }),
);

/**
 * The stored form of the fields a client can fill with anything. The
 * catalog only bounds `sessionId` and id properties (tripId, jobId) to
 * 1–128 characters, so an email or a phone number passes validation; they
 * are stored as keyed hashes like userId (CLAUDE.md: PII is hashed before
 * it reaches anything stored for analysis). Hashes are stable, so events
 * still join on session, trip and job. Enums, literals and numbers are
 * kept readable.
 */
export function pseudonymizeEvent(event: AnalyticsEvent): {
  userId: string | null;
  sessionId: string;
  properties: Record<string, unknown>;
} {
  const readable = READABLE_KEYS.get(event.name);
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event.properties)) {
    properties[key] =
      typeof value === "string" && !readable?.has(key)
        ? hashField(key, value)
        : value;
  }
  return {
    userId: event.userId === null ? null : hashUserId(event.userId),
    sessionId: hashField("sessionId", event.sessionId),
    properties,
  };
}
