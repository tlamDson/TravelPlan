/**
 * Calendar Controller
 *
 * Handles HTTP requests for Google Calendar sync operations.
 */

import { Response } from "express";
import { ClerkRequest } from "../../../types/express";
import { logger } from "../../../lib/logger";
import { tripRepository } from "../../planner/repositories/trip.repository";
import { getGoogleAccessToken } from "../services/clerk-oauth.service";
import { assertCalendarSyncVip } from "../services/calendar-sync-vip-guard.service";
import { calendarSyncQueue } from "../calendar.queue";

/**
 * POST /api/trips/:tripId/sync-calendar
 * Queues a background job to sync the trip itinerary to Google Calendar.
 * (Route is only registered when `isCalendarSyncEnabled()` is true — see `index.ts`.)
 */
export const syncTripToCalendar = async (
  req: ClerkRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.auth?.()?.userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const vip = await assertCalendarSyncVip(userId);
    if (!vip.ok) {
      if (vip.reason === "no_email") {
        res.status(403).json({
          success: false,
          code: "CALENDAR_VIP_REQUIRED",
          message: "Could not determine the account email to check calendar sync access.",
        });
        return;
      }
      res.status(403).json({
        success: false,
        code: "CALENDAR_VIP_ONLY",
        message:
          "Google Calendar sync is only available to invited accounts (VIP/Tester).",
      });
      return;
    }

    const { tripId } = req.params;
    if (!tripId) {
      res.status(400).json({ message: "Trip ID is required" });
      return;
    }

    // Verify trip ownership
    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      res.status(404).json({ message: "Trip not found" });
      return;
    }
    if (trip.userId !== userId) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    // Verify Google OAuth token exists before queuing
    const token = await getGoogleAccessToken(userId);
    if (!token) {
      res.status(400).json({
        success: false,
        code: "GOOGLE_NOT_CONNECTED",
        message:
          "Please sign in with Google to sync to Calendar. Your account needs to be connected via Google OAuth.",
      });
      return;
    }

    // Queue the background sync job
    const job = await calendarSyncQueue.add("sync", { tripId, userId });

    logger.info({ jobId: job.id, tripId, userId }, "Calendar sync job queued");

    res.status(202).json({
      success: true,
      jobId: job.id,
      message: "Sync started — events will appear on Google Calendar shortly",
    });
  } catch (error: any) {
    logger.error(
      { err: error, tripId: req.params.tripId },
      "Failed to queue calendar sync",
    );
    res.status(500).json({ message: "Failed to start calendar sync" });
  }
};
