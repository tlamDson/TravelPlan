import type { Request, Response } from "express";
import {
  analyticsEventBatchSchema,
  analyticsIngestResultSchema,
} from "@travelplan/shared";
import { logger } from "../../../lib/logger";
import { ingestEvents } from "../services/analytics-ingest.service";

/**
 * POST /api/analytics/events
 *
 * Public (anonymous visitors log too); metered by analyticsLimiter in
 * routes.ts. Only the batch shape can 400 — each event inside is validated
 * by the service, so one bad event is quarantined, not the whole batch.
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

  try {
    const result = analyticsIngestResultSchema.parse(
      await ingestEvents(batch.data.events),
    );
    res.status(200).json(result);
  } catch (err) {
    logger.error({ err }, "Analytics ingest failed");
    res.status(500).json({ success: false, message: "Ingest failed" });
  }
}
