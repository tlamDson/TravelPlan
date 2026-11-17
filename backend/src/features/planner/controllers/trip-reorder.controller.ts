import { Response } from "express";
import { tripRepository } from "../repositories/trip.repository";
import { ClerkRequest } from "../../../types/express";
import { logger } from "../../../lib/logger";
import { validateReorderIds } from "../services/reorder-validator";
import type { IActivity, IActivitySubdocument } from "../models/Trip.types";

/**
 * PATCH /api/trips/:tripId/reorder-activities
 * Reorders activities within a single day (drag-and-drop support).
 * Body: { dayIndex: number, orderedActivityIds: string[] }
 */
export const reorderActivities = async (
  req: ClerkRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.auth?.()?.userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { tripId } = req.params;
    if (!tripId) {
      res.status(400).json({ message: "Trip ID is required" });
      return;
    }

    const { dayIndex, orderedActivityIds } = req.body;

    if (
      typeof dayIndex !== "number" ||
      !Array.isArray(orderedActivityIds) ||
      orderedActivityIds.length === 0
    ) {
      res.status(400).json({
        message:
          "dayIndex (number) and orderedActivityIds (string[]) are required",
      });
      return;
    }

    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      res.status(404).json({ message: "Trip not found" });
      return;
    }

    if (trip.userId !== userId) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    if (trip.isAgentProcessing) {
      res
        .status(409)
        .json({ message: "Trip is being processed by AI — try again shortly" });
      return;
    }

    const day = trip.itinerary[dayIndex];
    if (!day) {
      res
        .status(400)
        .json({ message: `Day index ${dayIndex} not found in itinerary` });
      return;
    }

    // Build id→activity map from the target day
    const activityMap = new Map<string, IActivity>(
      day.activities.map((a) => [a._id!.toString(), a]),
    );

    // Ids must be an exact permutation of the day's current activities
    const currentIds = day.activities.map((a) => a._id!.toString());
    const check = validateReorderIds(currentIds, orderedActivityIds);
    if (!check.ok) {
      res.status(400).json({ message: check.message });
      return;
    }

    // Guard: if the supplied order matches the current order, skip the DB write
    const isSameOrder = currentIds.every(
      (id, idx) => id === orderedActivityIds[idx],
    );
    if (isSameOrder) {
      res.json({ success: true, itinerary: trip.itinerary });
      return;
    }

    // Re-assign `order` field to match the new sequence. Cast to
    // IActivitySubdocument for .toObject() — safe here because every id was
    // already verified present in activityMap above, and ActivitySchema's
    // `{ _id: true }` guarantees every persisted activity is a real Mongoose
    // subdocument with .toObject() at runtime.
    const reordered: IActivity[] = orderedActivityIds.map((id, idx) => {
      const act = activityMap.get(id) as IActivitySubdocument;
      return { ...act.toObject(), order: idx };
    });

    // Snapshot current itinerary for undo before mutation
    await tripRepository.saveSnapshot(tripId);

    const { recalcDayDistances } =
      await import("../services/activity-regen.service");

    trip.itinerary[dayIndex]!.activities = reordered;
    recalcDayDistances(trip.itinerary[dayIndex]!.activities);
    trip.markModified("itinerary");
    await trip.save();

    logger.info(
      { tripId, userId, dayIndex, count: reordered.length },
      "✅ Activities reordered",
    );
    res.json({ success: true, itinerary: trip.itinerary });
  } catch (error: any) {
    logger.error(
      { error, tripId: req.params.tripId },
      "Failed to reorder activities",
    );
    res.status(500).json({ message: "Failed to reorder activities" });
  }
};
