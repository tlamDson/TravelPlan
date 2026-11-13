import {
  analyticsEventSchema,
  type AnalyticsIngestResult,
} from "@travelplan/shared";
import type { IAnalyticsEvent } from "../models/AnalyticsEvent";
import type { IAnalyticsQuarantine } from "../models/AnalyticsQuarantine";
import { analyticsEventRepository } from "../repositories/analytics-event.repository";
import { analyticsQuarantineRepository } from "../repositories/analytics-quarantine.repository";
import { classifyQuarantine } from "./quarantine-reason";

/** Raw JSON kept per quarantined event; the rest is cut and flagged. */
export const QUARANTINE_RAW_MAX_CHARS = 8_192;

function toQuarantineDoc(
  raw: unknown,
  classified: ReturnType<typeof classifyQuarantine>,
  receivedAt: Date,
): IAnalyticsQuarantine {
  const json = JSON.stringify(raw) ?? "null";
  const rawTruncated = json.length > QUARANTINE_RAW_MAX_CHARS;
  return {
    reason: classified.reason,
    issues: classified.issues,
    raw: rawTruncated ? json.slice(0, QUARANTINE_RAW_MAX_CHARS) : json,
    rawTruncated,
    receivedAt,
  };
}

/**
 * Ingests one batch (G-event rules, packages/shared/fixtures/golden-events/
 * ingest-batch/truth.json): every event is validated on its own; a bad one
 * is quarantined and never deduplicated; a valid one whose eventId was seen
 * earlier in the batch or is already stored counts as a duplicate.
 * Also the entry point for server-written events (exposure, PR 6).
 */
export async function ingestEvents(
  rawEvents: readonly unknown[],
  now: Date = new Date(),
): Promise<AnalyticsIngestResult> {
  const fresh = new Map<string, IAnalyticsEvent>();
  const quarantine: IAnalyticsQuarantine[] = [];
  let inBatchDuplicates = 0;

  for (const raw of rawEvents) {
    const parsed = analyticsEventSchema.safeParse(raw);
    if (!parsed.success) {
      const classified = classifyQuarantine(raw, parsed.error.issues);
      quarantine.push(toQuarantineDoc(raw, classified, now));
      continue;
    }
    const event = parsed.data;
    if (fresh.has(event.eventId)) {
      inBatchDuplicates++;
      continue;
    }
    fresh.set(event.eventId, {
      ...event,
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
