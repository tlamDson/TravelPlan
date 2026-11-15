import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsEvent,
} from "@travelplan/shared";
import { hashField } from "../../analytics/services/pseudonymize";
import type { Assignment } from "./assignment";

type ExposureEvent = Extract<AnalyticsEvent, { name: "experiment_exposure" }>;

/**
 * eventId for one (experiment, user, session) exposure. Deterministic, so
 * the analytics_events unique eventId index turns every repeat in the same
 * session into a duplicate: "once per session" holds server-side even if
 * the client re-sends. Keyed HMAC (not a bare hash) so the id can't be
 * linked back to a known userId; laid out as an RFC 9562 version-8 UUID.
 */
export function exposureEventId(
  experimentKey: string,
  userId: string,
  sessionId: string,
): string {
  const hex = hashField(
    "experimentExposure",
    JSON.stringify([experimentKey, userId, sessionId]),
  ).slice(0, 32);
  const variantNibble = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variantNibble}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/**
 * The `experiment_exposure` event the server writes when a variant is
 * rendered. userId/sessionId are raw here; ingest stores them hashed.
 */
export function buildExposureEvent(input: {
  experimentKey: string;
  userId: string;
  sessionId: string;
  assignment: Assignment;
  now: Date;
}): ExposureEvent {
  const { experimentKey, userId, sessionId, assignment, now } = input;
  return {
    eventId: exposureEventId(experimentKey, userId, sessionId),
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    name: "experiment_exposure",
    occurredAt: now.toISOString(),
    sessionId,
    userId,
    source: "server",
    properties: {
      experimentKey,
      variant: assignment.variant,
      bucket: assignment.bucket,
    },
  };
}
