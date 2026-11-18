import { Response } from "express";
import { tripRepository } from "../repositories/trip.repository";
import { ClerkRequest } from "../../../types/express";
import { logger } from "../../../lib/logger";
import {
  tripIdParamSchema,
  updateTripBodySchema,
} from "../schemas/trip-update.schema";

/**
 * DELETE /api/trips/:tripId - Delete a trip
 */
export const deleteTripById = async (
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

    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      res.status(404).json({ message: "Trip not found" });
      return;
    }

    // Verify ownership
    if (trip.userId !== userId) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    await tripRepository.delete(tripId);
    logger.info({ tripId, userId }, "Trip deleted");

    res.status(200).json({ success: true, message: "Trip deleted" });
  } catch (error: any) {
    logger.error({ error, tripId: req.params.tripId }, "Failed to delete trip");
    res.status(500).json({ message: "Failed to delete trip" });
  }
};

/**
 * PATCH /api/trips/:tripId - Update trip fields (e.g. title)
 */
export const updateTripById = async (
  req: ClerkRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.auth?.()?.userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const params = tripIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: "Invalid trip ID" });
      return;
    }
    const { tripId } = params.data;

    const body = updateTripBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        message: "Invalid trip data",
        errors: body.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
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

    // Schema keeps only title/description; drop keys the client left out.
    const updateData = Object.fromEntries(
      Object.entries(body.data).filter(([, v]) => v !== undefined),
    );

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ message: "No valid fields to update" });
      return;
    }

    const updatedTrip = await tripRepository.update(tripId, updateData);
    logger.info({ tripId, userId, updateData }, "Trip updated");

    res.json({ success: true, data: updatedTrip });
  } catch (error: any) {
    logger.error({ error, tripId: req.params.tripId }, "Failed to update trip");
    res.status(500).json({ message: "Failed to update trip" });
  }
};

/**
 * PATCH /api/trips/:tripId/undo — Undo the last itinerary change
 * Restores the most recent snapshot from itineraryHistory.
 */
export const undoTrip = async (
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
      res.status(400).json({ message: "Trip ID required" });
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

    const restored = await tripRepository.undoLastChange(tripId);
    if (!restored) {
      res.status(409).json({ message: "No undo history available" });
      return;
    }

    logger.info({ tripId, userId }, "↩ Undo applied — itinerary restored");
    res.json({ success: true, itinerary: restored });
  } catch (error: any) {
    logger.error({ error, tripId: req.params.tripId }, "Failed to undo trip");
    res.status(500).json({ message: "Failed to undo" });
  }
};
