import {
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
import { classifyQuarantine } from "./quarantine-reason";

type Violation = ReturnType<typeof classifyQuarantine>;
/** Extra rule applied to a schema-valid event; null means allowed. */
type Policy = (event: AnalyticsEvent) => Violation | null;

const EVENT_ID_SHAPE = /^[A-Za-z0-9-]{1,128}$/;
const EVENT_NAME_SHAPE = /^[a-z0-9_]{1,64}$/;

function field(raw: unknown, key: string): unknown {
  return raw !== null && typeof raw === "object"
    ? (raw as Record<string, unknown>)[key]
    : undefined;
}

function idShaped(value: unknown, shape: RegExp): string | null {
  return typeof value === "string" && shape.test(value) ? value : null;
}

/**
 * Quarantine keeps no raw payload: an invalid event can carry anything
 * (emails, free text), so only id-shaped identifiers, the hashed userId
 * and the validation issues are stored.
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
    eventId: idShaped(field(raw, "eventId"), EVENT_ID_SHAPE),
    eventName: idShaped(field(raw, "name"), EVENT_NAME_SHAPE),
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
      userId: event.userId === null ? null : hashUserId(event.userId),
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
