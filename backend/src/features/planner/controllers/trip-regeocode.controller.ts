import { Response } from "express";
import { tripRepository } from "../repositories/trip.repository";
import { validationService } from "../services/validation.service";
import { ClerkRequest } from "../../../types/express";
import { logger } from "../../../lib/logger";

/**
 * POST /api/trips/:tripId/regeocode
 * Re-validates coordinates for all activities in an existing trip.
 * Useful when a trip was generated before API keys were configured.
 */
export const reGeocodeTrip = async (
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

    // Prefer the trip's real destination; the title is free text ("My Summer
    // Vacation") and only a fallback when no destination was stored.
    const destination =
      trip.destination?.trim() ||
      (trip.title.split(/[,\-–]/)[0]?.trim() ?? "");

    let updated = 0;
    let failed = 0;

    for (const day of trip.itinerary) {
      for (const activity of day.activities) {
        try {
          // validateIntent appends the destination city itself; pass the bare name.
          const result = await validationService.validateIntent(
            activity.name,
            destination,
          );

          if (result) {
            activity.name = result.name;
            activity.location = {
              type: "Point",
              coordinates: result.coordinates, // [lng, lat]
            };
            if (result.rating !== undefined) activity.rating = result.rating;
            if (result.priceLevel !== undefined)
              activity.priceLevel = result.priceLevel;
            if (result.openingHours)
              activity.openingHours = result.openingHours;
            if (result.photoUrl) activity.photoUrl = result.photoUrl;
            updated++;
          } else {
            failed++;
            logger.warn(
              { name: activity.name, tripId },
              "Re-geocode: no result",
            );
          }
        } catch (err: any) {
          failed++;
          logger.error(
            { name: activity.name, err: err.message },
            "Re-geocode activity failed",
          );
        }
      }
    }

    await trip.save();

    logger.info({ tripId, updated, failed }, "Re-geocode complete");
    res.json({
      success: true,
      message: `Re-geocoded ${updated} activities (${failed} failed)`,
      updated,
      failed,
    });
  } catch (error: any) {
    logger.error({ error, tripId: req.params.tripId }, "reGeocodeTrip failed");
    res.status(500).json({ message: "Re-geocode failed" });
  }
};
