import { Response, NextFunction } from "express";
import { ClerkRequest } from "../types/express";
import IdempotencyLog from "../features/user/models/IdempotencyLog";
import { logger } from "../lib/logger";

/**
 * Idempotency middleware for POST /api/trips.
 *
 * Reads the X-Idempotency-Key header. If a matching log exists for this
 * user and its job is already stored, short-circuits with the cached
 * tripId/jobId (200). This is only a fast path: the controller reserves the
 * key with a unique insert before enqueueing, which is what stops concurrent
 * double submits.
 */
export async function idempotencyMiddleware(
  req: ClerkRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.headers["x-idempotency-key"] as string | undefined;
  if (!key) {
    next();
    return;
  }

  const userId = req.auth?.()?.userId;
  if (!userId) {
    next();
    return;
  }

  try {
    const existing = await IdempotencyLog.findOne({ key, userId }).exec();
    if (existing?.tripId) {
      logger.info(
        { key, userId, tripId: existing.tripId },
        "Idempotency: returning cached result",
      );
      res.status(200).json({
        success: true,
        message: "Trip generation already started (idempotent)",
        tripId: existing.tripId,
        jobId: existing.jobId,
        idempotent: true,
      });
      return;
    }
  } catch (err) {
    // Non-fatal: if DB check fails, let the request through
    logger.warn({ err, key }, "Idempotency check failed — proceeding without");
  }

  next();
}
