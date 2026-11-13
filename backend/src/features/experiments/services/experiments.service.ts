import {
  experimentDefinitionSchema,
  type ExperimentAssignment,
  type ExperimentDefinition,
  type ExperimentExposureRequest,
  type ExperimentExposureResponse,
} from "@travelplan/shared";
import { logger } from "../../../lib/logger";
import { ingestTrustedEvents } from "../../analytics/services/analytics-ingest.service";
import { experimentRepository } from "../repositories/experiment.repository";
import { assignVariant } from "./assignment";
import { buildExposureEvent } from "./exposure-event";

/** A stored doc that breaks the definition rules is skipped, never served. */
function toDefinition(doc: unknown): ExperimentDefinition | null {
  const parsed = experimentDefinitionSchema.safeParse(doc);
  if (parsed.success) return parsed.data;
  const key =
    doc !== null && typeof doc === "object"
      ? (doc as { key?: unknown }).key
      : undefined;
  logger.warn(
    { experimentKey: typeof key === "string" ? key : null },
    "Skipping invalid experiment definition",
  );
  return null;
}

/** The user's variant in every running experiment. */
export async function getAssignments(
  userId: string,
): Promise<ExperimentAssignment[]> {
  const docs = await experimentRepository.findRunning();
  return docs.flatMap((doc) => {
    const def = toDefinition(doc);
    if (!def) return [];
    return [
      { experimentKey: def.key, variant: assignVariant(def, userId).variant },
    ];
  });
}

/**
 * Stores one `experiment_exposure` for (experiment, user, session). The
 * variant is recomputed here, never taken from the client. Returns null
 * when the experiment is not running. A repeat in the same session maps
 * to the same eventId, so ingest counts it as a duplicate and
 * `recorded` is false.
 */
export async function recordExposure(
  userId: string,
  request: ExperimentExposureRequest,
  now: Date = new Date(),
): Promise<ExperimentExposureResponse | null> {
  const doc = await experimentRepository.findRunningByKey(
    request.experimentKey,
  );
  const def = doc ? toDefinition(doc) : null;
  if (!def) return null;

  const assignment = assignVariant(def, userId);
  const event = buildExposureEvent({
    experimentKey: def.key,
    userId,
    sessionId: request.sessionId,
    assignment,
    now,
  });
  const result = await ingestTrustedEvents([event], now);
  if (result.quarantined > 0) {
    throw new Error(`Server exposure event quarantined for ${def.key}`);
  }
  return {
    experimentKey: def.key,
    variant: assignment.variant,
    recorded: result.accepted === 1,
  };
}
