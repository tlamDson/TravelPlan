/**
 * Calendar Sync Job Processor
 *
 * BullMQ worker processor that syncs a trip's itinerary to Google Calendar.
 * Orchestrates: token retrieval → data formatting → Google API sync → DB update.
 */

import { Job } from "bullmq";
import { workerLogger as logger } from "../../../lib/logger";
import { tripRepository } from "../../planner/repositories/trip.repository";
import { getGoogleAccessToken } from "../services/clerk-oauth.service";
import { itineraryToGoogleEvents } from "../services/calendar-format.service";
import { syncEventsToGoogle } from "../services/google-calendar.service";
import type { CalendarSyncJobData } from "../calendar.queue";
import { isCalendarSyncEnabled } from "../calendar-feature-flag";

export async function calendarSyncProcessor(
  job: Job<CalendarSyncJobData>,
): Promise<{ success: boolean; eventCount: number }> {
  const { tripId, userId } = job.data;

  if (!isCalendarSyncEnabled()) {
    logger.warn(
      { jobId: job.id, tripId },
      "Calendar sync job skipped — ENABLE_GOOGLE_CALENDAR_SYNC is off",
    );
    return { success: false, eventCount: 0 };
  }

  logger.info({ jobId: job.id, tripId, userId }, "Calendar sync job started");

  // Step 1 — Get Google OAuth token from Clerk
  await job.updateProgress(10);
  const token = await getGoogleAccessToken(userId);
  if (!token) {
    throw new Error(
      "GOOGLE_NOT_CONNECTED: User has not connected a Google account",
    );
  }

  // Step 2 — Load trip data
  await job.updateProgress(20);
  const trip = await tripRepository.findById(tripId);
  if (!trip) {
    throw new Error("TRIP_NOT_FOUND");
  }
  if (trip.userId !== userId) {
    throw new Error("FORBIDDEN");
  }

  // Step 3 — Format itinerary into Google Calendar events
  await job.updateProgress(40);
  const eventsWithKeys = itineraryToGoogleEvents(
    trip.itinerary,
    tripId,
    trip.destination,
    trip.title,
  );

  if (eventsWithKeys.length === 0) {
    logger.info({ tripId }, "No activities to sync to Google Calendar");
    return { success: true, eventCount: 0 };
  }

  // Step 4 — Sync events (with incremental DB save for partial failure protection)
  await job.updateProgress(60);
  const existingGoogleEventIds = (trip as any).googleEventIds as
    Record<string, string> | undefined;

  const updatedGoogleEventIds = await syncEventsToGoogle(
    token,
    eventsWithKeys,
    existingGoogleEventIds,
    {
      // Save progress after each chunk so that retries don't re-create existing events
      onChunkComplete: async (partialIds) => {
        await tripRepository.update(tripId, {
          googleEventIds: partialIds,
        } as any);
      },
    },
  );

  // Step 5 — Final DB update
  await job.updateProgress(90);
  await tripRepository.update(tripId, {
    googleEventIds: updatedGoogleEventIds,
  } as any);

  await job.updateProgress(100);
  logger.info(
    { jobId: job.id, tripId, eventCount: eventsWithKeys.length },
    "Calendar sync completed",
  );

  return { success: true, eventCount: eventsWithKeys.length };
}
