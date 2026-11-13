import type { Request, Response } from "express";
import type { ClerkRequest } from "../../../types/express";
import {
  analyticsEventBatchSchema,
  analyticsIngestResultSchema,
} from "@travelplan/shared";
import { logger } from "../../../lib/logger";
import { ingestClientEvents } from "../services/analytics-ingest.service";

/**
 * POST /api/analytics/events
 *
 * Public (anonymous visitors log too); metered by analyticsLimiter in
 * routes.ts. Only the batch shape can 400 — each event inside is validated
 * by the service, so one bad event is quarantined, not the whole batch.
 * The Clerk session (not the event body) decides who the caller is, so a
 * client can't log events as another user or forge server-only exposure.
 * A 500 is safe for the client to retry with the same eventIds.
 */
export async function postAnalyticsEvents(
  req: Request,
  res: Response,
): Promise<void> {
  const batch = analyticsEventBatchSchema.safeParse(req.body);
  if (!batch.success) {
    res.status(400).json({ success: false, message: "Invalid event batch" });
    return;
  }

  const authUserId = (req as ClerkRequest).auth?.()?.userId ?? null;
  try {
    const result = analyticsIngestResultSchema.parse(
      await ingestClientEvents(batch.data.events, authUserId),
    );
    res.status(200).json(result);
  } catch (err) {
    logger.error({ err }, "Analytics ingest failed");
    res.status(500).json({ success: false, message: "Ingest failed" });
  }
}
