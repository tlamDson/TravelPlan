import { Response } from "express";
import { z } from "zod";
import { sloReportResponseSchema } from "@travelplan/shared";
import { ClerkRequest } from "../../../types/express";
import { logger } from "../../../lib/logger";
import { QUEUE_NAMES } from "../../../lib/queue-defaults";
import { buildSloReport } from "../services/slo-report.service";
import { assertReliabilityAdminAccess } from "../services/reliability-admin-guard.service";

const sloQuerySchema = z.object({
  queue: z
    .enum([
      QUEUE_NAMES.TRIP_GENERATION,
      QUEUE_NAMES.CALENDAR_SYNC,
      QUEUE_NAMES.INSIGHT_SCRAPER,
    ])
    .optional(),
  windowDays: z.coerce.number().int().positive().optional(),
});

/**
 * GET /api/reliability/slo
 *
 * 3-layer security: mount flag (app.ts, isReliabilityApiEnabled) →
 * requireUserAuth (routes.ts, Clerk session) → this controller's
 * allowlist check. Dumb controller: validate → service → JSON, never
 * imports Mongoose.
 */
export async function getSloReport(
  req: ClerkRequest,
  res: Response,
): Promise<void> {
  try {
    const clerkId = req.auth?.()?.userId;
    if (!clerkId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const access = await assertReliabilityAdminAccess(clerkId);
    if (!access.ok) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }

    const parsedQuery = sloQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({ success: false, message: "Invalid query" });
      return;
    }

    // Built with conditional spreads (not passed as-is) — Zod's optional
    // fields type as `T | undefined`, but exactOptionalPropertyTypes
    // treats an explicit `undefined` value as distinct from an absent key.
    const report = await buildSloReport({
      ...(parsedQuery.data.queue !== undefined
        ? { queue: parsedQuery.data.queue }
        : {}),
      ...(parsedQuery.data.windowDays !== undefined
        ? { windowDays: parsedQuery.data.windowDays }
        : {}),
    });

    const validated = sloReportResponseSchema.safeParse(report);
    if (!validated.success) {
      logger.error(
        { issues: validated.error.flatten() },
        "SLO report failed schema validation",
      );
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
      return;
    }

    res.json(validated.data);
  } catch (err) {
    logger.error({ err }, "Failed to build SLO report");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}
