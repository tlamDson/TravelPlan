import { Response, NextFunction } from "express";
import { ClerkRequest } from "../types/express";
import IdempotencyLog from "../features/user/models/IdempotencyLog";
import { logger } from "../lib/logger";

/**
 * Idempotency middleware for POST /api/trips.
 *
 * Reads the X-Idempotency-Key header. If a matching log exists for this
 * user, short-circuits with the cached tripId/jobId (200). Otherwise the
 * request continues normally and the controller reserves the key before it
 * enqueues. A reservation that is still pending answers 409.
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
    if (existing?.status === "pending") {
      res.status(409).json({
        success: false,
        message: "A request with this idempotency key is already in progress",
      });
      return;
    }
    if (existing) {
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
