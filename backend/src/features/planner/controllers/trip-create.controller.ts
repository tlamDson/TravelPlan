import { Response } from "express";
import { plannerService } from "../services/planner.service";
import { ClerkRequest } from "../../../types/express";
import { TripPreferencesSchema } from "../schemas/trip-request.schema";
import { TripRequestError } from "../errors";
import { logger } from "../../../lib/logger";
import { userQuotaService } from "../services/user-quota.service";
import { userRepository } from "../../user/repositories/user.repository";
import {
  idempotencyRepository,
  type IdempotencyReservation,
} from "../../user/repositories/idempotency.repository";

/** Seconds a same-key duplicate should wait while the first one enqueues. */
const PENDING_RETRY_AFTER_SECONDS = "2";

/**
 * Answers a request whose idempotency key is already held. A pending key is
 * never answered with "use a new key": the first request may still create a
 * trip, so a new key would create a second one.
 */
function sendDuplicate(
  res: Response,
  reservation: Exclude<IdempotencyReservation, { status: "reserved" }>,
): void {
  if (reservation.status === "completed") {
    res.status(200).json({
      success: true,
      message: "Trip generation already started (idempotent)",
      tripId: reservation.tripId,
      jobId: reservation.jobId,
      idempotent: true,
    });
    return;
  }
  if (reservation.status === "pending") {
    res.set("Retry-After", PENDING_RETRY_AFTER_SECONDS);
    res.status(409).json({
      success: false,
      message:
        "A request with this idempotency key is still being processed; retry later with the same key",
      idempotent: true,
    });
    return;
  }
  res.status(409).json({
    success: false,
    message:
      "An earlier request with this idempotency key failed partway and may have created a trip; check your trips before submitting again",
    idempotent: true,
  });
}

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

    // Read the user before reserving: nothing between the reservation and
    // the service's first write may fail without releasing the key.
    const user = await userRepository.findByClerkId(userId);
    const userTier = user?.tier ?? "free";

    // Reserve the key before enqueueing: only one of two concurrent requests
    // with the same key wins the unique insert and creates a trip.
    if (idempotencyKey) {
      const reservation = await idempotencyRepository.reserve(
        userId,
        idempotencyKey,
      );
      if (reservation.status !== "reserved") {
        sendDuplicate(res, reservation);
        return;
      }
    }

    // Frees the key after a failure that wrote nothing, so a retry can pass.
    const releaseKey = async (): Promise<void> => {
      if (!idempotencyKey) return;
      try {
        await idempotencyRepository.release(userId, idempotencyKey);
      } catch (err) {
        logger.warn({ err, userId }, "Failed to release idempotency key");
      }
    };

    // Check quota (database-level fallback) only after the key is reserved:
    // the first request may have used the last trip, and its same-key
    // duplicate must still get the stored result above, not a 429.
    let quota: Awaited<ReturnType<typeof userQuotaService.canCreateTrip>>;
    try {
      quota = await userQuotaService.canCreateTrip(userId);
    } catch (error) {
      await releaseKey();
      throw error;
    }
    if (!quota.allowed) {
      await releaseKey();
      res.status(429).json({
        error: "Monthly trip limit exceeded",
        message: "Free tier users can create up to 10 trips per billing cycle.",
        remaining: quota.remaining,
        resetAt: quota.resetAt,
      });
      return;
    }

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
        userTier,
      });
    } catch (error) {
      // Free the key only when nothing was written. After a partial failure
      // a trip or job may exist, so a same-key retry must not create another.
      if (error instanceof TripRequestError) await releaseKey();
      throw error;
    }

    // The job is accepted: a failed result write must not turn into an error
    // response. The key stays reserved, so duplicates still cannot enqueue.
    if (idempotencyKey) {
      try {
        await idempotencyRepository.complete(userId, idempotencyKey, {
          tripId: result.tripId,
          jobId: result.jobId,
        });
      } catch (err) {
        logger.error(
          { err, userId, tripId: result.tripId },
          "Failed to store idempotency result",
        );
      }
    }

    res.status(202).json({
      success: true,
      message: "Trip generation started",
      ...result,
      tier: userTier,
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
