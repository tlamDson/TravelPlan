import { createQueue } from "../../lib/queue";
import { QUEUE_NAMES, DEFAULT_JOB_RETENTION } from "../../lib/queue-defaults";
import type { TripPreferences } from "@travelplan/shared";

/**
 * The single `trip-generation` queue instance — previously created twice,
 * independently, in `planner.service.ts` and `trip-status.service.ts`
 * (neither exported it), each opening its own Redis connection for the
 * same queue name.
 */
export const tripQueue = createQueue(QUEUE_NAMES.TRIP_GENERATION);

/**
 * Shared job options for every trip-generation job — both the initial
 * submission (`planner.service.ts`) and a user-triggered retry
 * (`trip-status.service.ts::retryTripJobForUser`). Before this, the retry
 * path passed no options at all: a retried job got BullMQ's 1-attempt
 * default (no exponential backoff), and because it also dropped
 * `userTier` from the payload, it could never take the static-fallback
 * path in `trip.processor.ts` (gated on `userTier === "free"`) or trigger
 * the pro credit-refund in `worker.ts` (gated on the same field).
 */
export const TRIP_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  ...DEFAULT_JOB_RETENTION,
} as const;

export interface TripJobData {
  tripId: string;
  userId: string;
  preferences: TripPreferences;
  language?: string;
  userTier: "free" | "pro";
}
