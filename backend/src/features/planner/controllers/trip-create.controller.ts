import { Response } from "express";
import { plannerService } from "../services/planner.service";
import { ClerkRequest } from "../../../types/express";
import { TripPreferencesSchema } from "../schemas/trip-request.schema";
import { logger } from "../../../lib/logger";
import { userQuotaService } from "../services/user-quota.service";
import { userRepository } from "../../user/repositories/user.repository";
import { idempotencyRepository } from "../../user/repositories/idempotency.repository";

/**
 * POST /api/trips - Generate new trip
 */
export const generateTrip = async (
  req: ClerkRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.auth?.()?.userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    // Check quota (database-level fallback)
    const quota = await userQuotaService.canCreateTrip(userId);
    if (!quota.allowed) {
      res.status(429).json({
        error: "Monthly trip limit exceeded",
        message: "Free tier users can create up to 10 trips per billing cycle.",
        remaining: quota.remaining,
        resetAt: quota.resetAt,
      });
      return;
    }

    // Validate request with Zod
    const validation = TripPreferencesSchema.safeParse(req.body.preferences);

    if (!validation.success) {
      logger.error(
        { errors: validation.error.issues, body: req.body },
        "Trip validation failed",
      );
      res.status(400).json({
        success: false,
        message: "Invalid trip preferences",
        errors: validation.error.issues,
      });
      return;
    }

    const preferences = validation.data;
    const { language, title } = req.body;
    const idempotencyKey = req.headers["x-idempotency-key"] as
      string | undefined;

    // Reserve the key before enqueueing: only one of two concurrent requests
    // with the same key wins the unique insert and creates a trip.
    if (idempotencyKey) {
      const reservation = await idempotencyRepository.reserve(
        userId,
        idempotencyKey,
      );
      if (reservation.status === "duplicate") {
        if (reservation.tripId) {
          res.status(200).json({
            success: true,
            message: "Trip generation already started (idempotent)",
            tripId: reservation.tripId,
            jobId: reservation.jobId,
            idempotent: true,
          });
        } else {
          res.status(409).json({
            success: false,
            message: "Trip generation for this request is already in progress",
            idempotent: true,
          });
        }
        return;
      }
    }

    const user = await userRepository.findByClerkId(userId);

    // Create job (with CFO validation)
    let result: Awaited<
      ReturnType<typeof plannerService.createTripGenerationJob>
    >;
    try {
      result = await plannerService.createTripGenerationJob({
        userId,
        preferences,
        language,
        title,
      });
    } catch (error) {
      if (idempotencyKey) {
        await idempotencyRepository
          .release(userId, idempotencyKey)
          .catch((err) =>
            logger.warn({ err, userId }, "Failed to release idempotency key"),
          );
      }
      throw error;
    }

    if (idempotencyKey) {
      await idempotencyRepository.complete(userId, idempotencyKey, {
        tripId: result.tripId,
        jobId: result.jobId,
      });
    }

    res.status(202).json({
      success: true,
      message: "Trip generation started",
      ...result,
      tier: user?.tier ?? "free",
      quota: {
        remaining:
          quota.limit === Number.MAX_SAFE_INTEGER
            ? Number.MAX_SAFE_INTEGER
            : Math.max(0, quota.remaining - 1),
        limit: quota.limit,
        tripsUsedThisCycle:
          quota.limit === Number.MAX_SAFE_INTEGER
            ? 0
            : Math.max(0, quota.limit - quota.remaining + 1),
        resetAt: quota.resetAt,
      },
    });
  } catch (error: any) {
    const userId: string = req.auth?.()?.userId ?? "";
    logger.error({ error, userId }, "Failed to generate trip");
    res.status(400).json({
      success: false,
      message: error.message || "Failed to start trip generation",
    });
  }
};
