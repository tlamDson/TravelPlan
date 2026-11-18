import { Response } from "express";
import { plannerService } from "../services/planner.service";
import { ClerkRequest } from "../../../types/express";
import { TripPreferencesSchema } from "../schemas/trip-request.schema";
import { TripRequestError } from "../errors";
import { logger } from "../../../lib/logger";
import { userQuotaService } from "../services/user-quota.service";
import { userRepository } from "../../user/repositories/user.repository";
import { idempotencyLogRepository } from "../../user/repositories/idempotency-log.repository";

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
      logger.warn(
        { paths: validation.error.issues.map((i) => i.path.join(".")) },
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

    const user = await userRepository.findByClerkId(userId);

    // Reserve the key first so a concurrent duplicate can never enqueue twice.
    let reserved = false;
    if (idempotencyKey) {
      try {
        const reservation = await idempotencyLogRepository.reserve(
          idempotencyKey,
          userId,
        );
        if (!reservation.reserved) {
          const { existing } = reservation;
          if (existing && existing.status !== "pending" && existing.tripId) {
            res.status(200).json({
              success: true,
              message: "Trip generation already started (idempotent)",
              tripId: existing.tripId,
              jobId: existing.jobId,
              idempotent: true,
            });
          } else {
            res.status(409).json({
              success: false,
              message:
                "A request with this idempotency key is already in progress",
            });
          }
          return;
        }
        reserved = true;
      } catch (err) {
        // Non-fatal, like the middleware check: proceed without idempotency.
        logger.warn({ err }, "Idempotency reservation failed — proceeding");
      }
    }

    // Create job (with CFO validation)
    let result;
    try {
      result = await plannerService.createTripGenerationJob({
        userId,
        preferences,
        language,
        title,
      });
    } catch (error) {
      if (reserved && idempotencyKey) {
        await idempotencyLogRepository
          .release(idempotencyKey, userId)
          .catch((err) =>
            logger.warn({ err }, "Failed to release idempotency reservation"),
          );
      }
      throw error;
    }

    if (reserved && idempotencyKey) {
      await idempotencyLogRepository
        .complete(idempotencyKey, userId, result.tripId, result.jobId)
        .catch((err) =>
          logger.error({ err }, "Failed to complete idempotency reservation"),
        );
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
  } catch (error) {
    const userId: string = req.auth?.()?.userId ?? "";
    if (error instanceof TripRequestError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    logger.error({ err: error, userId }, "Failed to generate trip");
    res.status(500).json({
      success: false,
      message: "Failed to start trip generation",
    });
  }
};
