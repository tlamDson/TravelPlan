import { z } from "zod";
import {
  ANALYTICS_EVENT_NAMES,
  analyticsEventSchema,
  type AnalyticsEvent,
  type AnalyticsIngestResult,
} from "@travelplan/shared";
import type { IAnalyticsEvent } from "../models/AnalyticsEvent";
import type { IAnalyticsQuarantine } from "../models/AnalyticsQuarantine";
import { analyticsEventRepository } from "../repositories/analytics-event.repository";
import { analyticsQuarantineRepository } from "../repositories/analytics-quarantine.repository";
import { clientPolicyViolation } from "./client-event-policy";
import { hashUserId } from "./pseudonymize";
import { pseudonymizeEvent } from "./pseudonymize-event";
import { classifyQuarantine } from "./quarantine-reason";
import { simPolicyViolation } from "./sim-event-policy";

type Violation = ReturnType<typeof classifyQuarantine>;
/** Extra rule applied to a schema-valid event; null means allowed. */
type Policy = (event: AnalyticsEvent) => Violation | null;

const uuidSchema = z.uuid();
const CATALOG_NAMES: ReadonlySet<string> = new Set(ANALYTICS_EVENT_NAMES);

function field(raw: unknown, key: string): unknown {
  return raw !== null && typeof raw === "object"
    ? (raw as Record<string, unknown>)[key]
    : undefined;
}

/** A well-formed eventId (a random UUID) is the only id worth keeping. */
function uuidOrNull(value: unknown): string | null {
  return uuidSchema.safeParse(value).success ? (value as string) : null;
}

/** A name is kept only when it is one of ours, never a client's string. */
function catalogNameOrNull(value: unknown): string | null {
  return typeof value === "string" && CATALOG_NAMES.has(value) ? value : null;
}

/**
 * Quarantine keeps no raw payload: an invalid event can carry anything
 * (emails, free text), so only a UUID eventId, a catalog event name, the
 * hashed userId and the issues' masked path + code are stored.
 */
function toQuarantineDoc(
  raw: unknown,
  violation: Violation,
  receivedAt: Date,
): IAnalyticsQuarantine {
  const userId = field(raw, "userId");
  return {
    reason: violation.reason,
    issues: violation.issues,
    eventId: uuidOrNull(field(raw, "eventId")),
    eventName: catalogNameOrNull(field(raw, "name")),
    userIdHash:
      typeof userId === "string" && userId.length > 0 && userId.length <= 128
        ? hashUserId(userId)
        : null,
    receivedAt,
  };
}

/**
 * G-event rules (packages/shared/fixtures/golden-events/ingest-batch/
 * truth.json): every event is validated on its own; a bad one is
 * quarantined and never deduplicated; a valid one whose eventId was seen
 * earlier in the batch or is already stored counts as a duplicate.
 */
async function ingest(
  rawEvents: readonly unknown[],
  policy: Policy,
  now: Date,
): Promise<AnalyticsIngestResult> {
  const fresh = new Map<string, IAnalyticsEvent>();
  const quarantine: IAnalyticsQuarantine[] = [];
  let inBatchDuplicates = 0;

  for (const raw of rawEvents) {
    const parsed = analyticsEventSchema.safeParse(raw);
    if (!parsed.success) {
      const violation = classifyQuarantine(raw, parsed.error.issues);
      quarantine.push(toQuarantineDoc(raw, violation, now));
      continue;
    }
    const event = parsed.data;
    const violation = policy(event);
    if (violation) {
      quarantine.push(toQuarantineDoc(raw, violation, now));
      continue;
    }
    if (fresh.has(event.eventId)) {
      inBatchDuplicates++;
      continue;
    }
    fresh.set(event.eventId, {
      ...event,
      ...pseudonymizeEvent(event),
      occurredAt: new Date(event.occurredAt),
      receivedAt: now,
    });
  }

  const accepted =
    fresh.size > 0
      ? await analyticsEventRepository.insertNew([...fresh.values()])
      : 0;
  if (quarantine.length > 0) {
    await analyticsQuarantineRepository.insertMany(quarantine);
  }

  return {
    received: rawEvents.length,
    accepted,
    duplicates: inBatchDuplicates + (fresh.size - accepted),
    quarantined: quarantine.length,
  };
}

/**
 * Events written by the server itself (experiment exposure, PR 6): schema
 * rules only, so `source: "server"` and any userId are accepted.
 */
export function ingestTrustedEvents(
  rawEvents: readonly unknown[],
  now: Date = new Date(),
): Promise<AnalyticsIngestResult> {
  return ingest(rawEvents, () => null, now);
}

/**
 * Events from the public HTTP endpoint: schema rules plus
 * clientPolicyViolation (no server-only events, no claiming another
 * user's id). `authUserId` is the Clerk session's user, or null.
 */
export function ingestClientEvents(
  rawEvents: readonly unknown[],
  authUserId: string | null,
  now: Date = new Date(),
): Promise<AnalyticsIngestResult> {
  return ingest(
    rawEvents,
    (event) => clientPolicyViolation(event, authUserId),
    now,
  );
}

/**
 * Events from the simkit load driver (POST /api/analytics/sim/events, a
 * local-only route): the trusted path's rules — so the server-sourced
 * exposures simkit writes are accepted — but only for simulated (`sim-`)
 * userIds (sim-event-policy.ts).
 */
export function ingestSimulatedEvents(
  rawEvents: readonly unknown[],
  now: Date = new Date(),
): Promise<AnalyticsIngestResult> {
  return ingest(rawEvents, simPolicyViolation, now);
}
