import type { Request, Response } from "express";
import type { ClerkRequest } from "../../../types/express";
import {
  experimentAssignmentsResponseSchema,
  experimentExposureRequestSchema,
  experimentExposureResponseSchema,
} from "@travelplan/shared";
import { logger } from "../../../lib/logger";
import {
  getAssignments,
  recordExposure,
} from "../services/experiments.service";

/** Clerk userId of the session; requireUserAuth (routes.ts) sets it. */
function sessionUserId(req: Request): string | null {
  return (req as ClerkRequest).auth?.()?.userId ?? null;
}

function unauthorized(res: Response): void {
  res.status(401).json({ success: false, message: "Unauthorized" });
}

/** GET /api/experiments/assignments — the session user's variants. */
export async function getExperimentAssignments(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = sessionUserId(req);
  if (!userId) return unauthorized(res);
  try {
    const body = experimentAssignmentsResponseSchema.parse({
      assignments: await getAssignments(userId),
    });
    res.status(200).json(body);
  } catch (err) {
    logger.error({ err }, "Experiment assignment failed");
    res.status(500).json({ success: false, message: "Assignment failed" });
  }
}

/**
 * POST /api/experiments/exposures — called when a variant renders. The
 * body names the experiment and session only; the server decides the
 * variant, so a client can't log an exposure it was never assigned.
 */
export async function postExperimentExposure(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = sessionUserId(req);
  if (!userId) return unauthorized(res);
  const parsed = experimentExposureRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid exposure" });
    return;
  }
  try {
    const result = await recordExposure(userId, parsed.data);
    if (!result) {
      res
        .status(404)
        .json({ success: false, message: "Experiment not running" });
      return;
    }
    res.status(200).json(experimentExposureResponseSchema.parse(result));
  } catch (err) {
    logger.error({ err }, "Experiment exposure logging failed");
    res.status(500).json({ success: false, message: "Exposure failed" });
  }
}
