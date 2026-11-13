import { z } from "zod";
import { MAX_TRIP_DAYS } from "../constants/trip.js";
import { jobOutcomeSchema } from "./reliability.schema.js";

/**
 * Analytics event catalog (B2 plan, PR 1). One envelope shared by every
 * event, a strict `properties` object per event name, and a wire batch.
 * Python (analytics/abkit) reads the JSON Schema exported from these
 * schemas into packages/shared/json-schema/ — never hand-edit those files,
 * run `npm run export:json-schema -w packages/shared`.
 *
 * userId is the raw Clerk id here; it is hashed at export time (PR 5)
 * before anything reaches the analytics layer. Never add PII (email, IP,
 * names) to the envelope or to properties.
 */

export const ANALYTICS_SCHEMA_VERSION = 1;
export const ANALYTICS_BATCH_MAX_EVENTS = 50;
export const ANALYTICS_BUCKET_COUNT = 10_000;

const idSchema = z.string().min(1).max(128);
const slugSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

const envelope = {
  eventId: z.uuid(),
  schemaVersion: z.literal(ANALYTICS_SCHEMA_VERSION),
  occurredAt: z.iso.datetime({ offset: true }),
  sessionId: idSchema,
  /** null for an anonymous visitor; required so "forgot to set it" is caught. */
  userId: idSchema.nullable(),
  source: z.enum(["web", "mobile", "server"]),
};

function defineEvent<N extends string, P extends z.ZodRawShape>(
  name: N,
  properties: P,
) {
  return z.strictObject({
    ...envelope,
    name: z.literal(name),
    properties: z.strictObject(properties),
  });
}

export const wizardStartedEventSchema = defineEvent("wizard_started", {
  entryPoint: z.enum(["dashboard", "landing", "trip_list"]),
});

export const tripGenerationRequestedEventSchema = defineEvent(
  "trip_generation_requested",
  {
    jobId: idSchema,
    durationDays: z.number().int().min(1).max(MAX_TRIP_DAYS),
    destinationCount: z.number().int().min(1).max(20),
  },
);

export const tripGenerationCompletedEventSchema = defineEvent(
  "trip_generation_completed",
  {
    jobId: idSchema,
    tripId: idSchema,
    outcome: jobOutcomeSchema,
    durationMs: z.number().int().min(0),
  },
);

export const tripViewedEventSchema = defineEvent("trip_viewed", {
  tripId: idSchema,
});

export const itineraryEditedEventSchema = defineEvent("itinerary_edited", {
  tripId: idSchema,
  editType: z.enum(["reorder", "regenerate_activity", "remove_activity"]),
  dayIndex: z.number().int().min(0),
});

export const tripSavedEventSchema = defineEvent("trip_saved", {
  tripId: idSchema,
});

export const calendarSyncedEventSchema = defineEvent("calendar_synced", {
  tripId: idSchema,
  provider: z.enum(["google"]),
});

/** Written by the server only, when a variant is rendered (B2 plan). */
export const experimentExposureEventSchema = defineEvent(
  "experiment_exposure",
  {
    experimentKey: slugSchema,
    variant: slugSchema,
    bucket: z
      .number()
      .int()
      .min(0)
      .max(ANALYTICS_BUCKET_COUNT - 1),
  },
).extend({ source: z.literal("server") });

export const analyticsEventSchema = z.discriminatedUnion("name", [
  wizardStartedEventSchema,
  tripGenerationRequestedEventSchema,
  tripGenerationCompletedEventSchema,
  tripViewedEventSchema,
  itineraryEditedEventSchema,
  tripSavedEventSchema,
  calendarSyncedEventSchema,
  experimentExposureEventSchema,
]);
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type AnalyticsEventName = AnalyticsEvent["name"];

export const ANALYTICS_EVENT_NAMES = analyticsEventSchema.options.map(
  (o) => o.shape.name.value,
) as readonly AnalyticsEventName[];

/**
 * Wire shape of `POST /api/analytics/events`. Items stay `unknown` on
 * purpose: each event is validated on its own, so one bad event is
 * quarantined instead of rejecting the whole batch.
 */
export const analyticsEventBatchSchema = z.object({
  events: z.array(z.unknown()).min(1).max(ANALYTICS_BATCH_MAX_EVENTS),
});
export type AnalyticsEventBatch = { events: AnalyticsEvent[] };

const countSchema = z.number().int().min(0);
export const analyticsIngestResultSchema = z
  .object({
    received: countSchema,
    accepted: countSchema,
    duplicates: countSchema,
    quarantined: countSchema,
  })
  .refine((r) => r.accepted + r.duplicates + r.quarantined === r.received, {
    message: "accepted + duplicates + quarantined must equal received",
    path: ["received"],
  });
export type AnalyticsIngestResult = z.infer<typeof analyticsIngestResultSchema>;
