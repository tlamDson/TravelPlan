import { logger } from "../../../lib/logger";
import { tripRepository } from "../repositories/trip.repository";
import { TripPreferences } from "../schemas/trip-request.schema";
import { tripQueue, TRIP_JOB_OPTIONS } from "../trip.queue";

/**
 * Retry a failed job.
 *
 * Split out of trip-status.service.ts (Rule of 200) when this function
 * grew to carry the retry-path job-options fix — see git history for the
 * bug this closed: the retry used to call tripQueue.add() with no options
 * at all, silently downgrading to BullMQ's 1-attempt default instead of
 * the original job's 3-attempts+backoff, and dropped `userTier` from the
 * payload entirely (trip.processor.ts gates the static-fallback path on
 * it, worker.ts gates the pro credit-refund on it).
 */
export async function retryTripJobForUser(jobId: string, userId: string) {
  const job = await tripQueue.getJob(jobId);
  if (!job) return null;

  const jobUserId = (job.data as { userId?: string })?.userId;
  if (jobUserId && jobUserId !== userId) {
    throw new Error("FORBIDDEN_JOB_ACCESS");
  }

  const state = await job.getState();
  if (state !== "failed") {
    throw new Error("JOB_NOT_FAILED");
  }

  const { tripId, preferences, language, userTier } = job.data as {
    tripId?: string;
    preferences?: TripPreferences;
    language?: string;
    userTier?: "free" | "pro";
  };

  if (!tripId || !preferences) {
    throw new Error("JOB_DATA_INVALID");
  }

  const trip = await tripRepository.findById(tripId);
  if (!trip) {
    throw new Error("TRIP_NOT_FOUND");
  }

  // Preserve the original job's priority + attempts/backoff/userTier — a
  // retry that drops these silently downgrades to BullMQ's 1-attempt
  // default and (via userTier) loses the static-fallback + pro
  // credit-refund gates in trip.processor.ts / worker.ts.
  const newJob = await tripQueue.add(
    job.name,
    {
      userId,
      tripId,
      preferences,
      language,
      userTier: userTier ?? "free",
    },
    {
      ...(job.opts?.priority !== undefined
        ? { priority: job.opts.priority }
        : {}),
      ...TRIP_JOB_OPTIONS,
    },
  );

  // forceAcquireLock: overwrite stale lock from previous failed job
  const lockedTrip = await tripRepository.forceAcquireLock(
    trip._id,
    newJob.id as string,
  );
  if (!lockedTrip) {
    throw new Error("TRIP_LOCKED");
  }

  await tripRepository.updateStatus(trip._id, "QUEUED");

  logger.info(
    { jobId: newJob.id, tripId: trip._id, userId },
    "Trip retry job queued",
  );

  return {
    jobId: newJob.id as string,
    tripId: trip._id.toString(),
  };
}
