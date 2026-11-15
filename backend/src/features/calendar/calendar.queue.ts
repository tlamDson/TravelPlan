/**
 * Calendar Sync BullMQ Queue
 *
 * Defines the queue and job data interface for Google Calendar sync jobs.
 */

import { createQueue } from "../../lib/queue";
import { QUEUE_NAMES, DEFAULT_JOB_RETENTION } from "../../lib/queue-defaults";

// attempts stays at BullMQ's default of 1 — retrying a calendar write risks
// creating duplicate events, so that's a deliberate product decision, not
// an oversight (see plan notes). Retention is still worth bounding so
// completed/failed syncs don't accumulate in Redis forever.
export const calendarSyncQueue = createQueue(QUEUE_NAMES.CALENDAR_SYNC, {
  defaultJobOptions: DEFAULT_JOB_RETENTION,
});

export interface CalendarSyncJobData {
  tripId: string;
  userId: string; // Clerk user ID
}
