import type { Request, Response } from "express";
import type { ClerkRequest } from "../../../types/express";
import {
  analyticsEventBatchSchema,
  analyticsIngestResultSchema,
  type AnalyticsIngestResult,
} from "@travelplan/shared";
import { logger } from "../../../lib/logger";
import {
  ingestClientEvents,
  ingestSimulatedEvents,
} from "../services/analytics-ingest.service";

/** Validates the batch shape, runs `ingest`, answers with its counts. */
async function respondWithIngest(
  req: Request,
  res: Response,
  ingest: (events: unknown[]) => Promise<AnalyticsIngestResult>,
): Promise<void> {
  const batch = analyticsEventBatchSchema.safeParse(req.body);
  if (!batch.success) {
    res.status(400).json({ success: false, message: "Invalid event batch" });
    return;
  }
  try {
    const result = analyticsIngestResultSchema.parse(
      await ingest(batch.data.events),
    );
    res.status(200).json(result);
  } catch (err) {
    logger.error({ err }, "Analytics ingest failed");
    res.status(500).json({ success: false, message: "Ingest failed" });
  }
}

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
  const authUserId = (req as ClerkRequest).auth?.()?.userId ?? null;
  await respondWithIngest(req, res, (events) =>
    ingestClientEvents(events, authUserId),
  );
}

/**
 * POST /api/analytics/sim/events — the simkit Locust driver (B2 plan,
 * PR 16). Mounted only with ANALYTICS_SIM_INGEST=true outside production
 * (routes.ts). No Clerk identity: the events must be simulated users'
 * (ingestSimulatedEvents), so the session is irrelevant.
 */
export async function postSimulatedAnalyticsEvents(
  req: Request,
  res: Response,
): Promise<void> {
  await respondWithIngest(req, res, (events) => ingestSimulatedEvents(events));
}
