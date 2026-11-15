import { logger } from "../../../lib/logger";
import { tripRepository } from "../repositories/trip.repository";
import { tripQueue } from "../trip.queue";

/**
 * Cancel a pending/processing job.
 *
 * Split out of trip-status.service.ts (Rule of 200) alongside
 * cancelTripForUser — the two cancel paths together made that file grow
 * past 200 lines once the retry-path fix was also extracted there.
 */
export async function cancelTripJobForUser(jobId: string, userId: string) {
  const job = await tripQueue.getJob(jobId);

  if (job) {
    const jobUserId = (job.data as { userId?: string })?.userId;
    if (jobUserId && jobUserId !== userId) {
      throw new Error("FORBIDDEN_JOB_ACCESS");
    }

    const state = await job.getState();
    if (state === "completed" || state === "failed") {
      throw new Error("JOB_ALREADY_FINISHED");
    }

    const { tripId } = job.data as { tripId?: string };

    // Attempt to discard/remove the job from BullMQ
    try {
      await job.remove();
    } catch (e) {
      logger.warn(
        { jobId, error: e },
        "Failed to remove job from queue, attempting to discard",
      );
      await job.discard();
    }

    if (tripId) {
      const trip = await tripRepository.findById(tripId);
      if (trip && trip.userId === userId) {
        await tripRepository.updateStatus(trip._id, "CANCELLED");
        await tripRepository.releaseLock(trip._id, jobId);
        logger.info({ jobId, tripId }, "Trip generation cancelled via job");
        return { success: true };
      }
    }
  } else {
    // If job isn't in queue but is still locked in DB, unlock and cancel
    const trip = await tripRepository.findByJobId(jobId);
    if (trip && trip.userId === userId) {
      await tripRepository.updateStatus(trip._id, "CANCELLED");
      await tripRepository.releaseLock(trip._id, jobId);
      logger.info(
        { jobId, tripId: trip._id },
        "Trip generation cancelled via fallback DB lookup",
      );
      return { success: true };
    }
  }

  throw new Error("JOB_NOT_FOUND");
}

/**
 * Cancel a pending/processing trip by tripId
 */
export async function cancelTripForUser(tripId: string, userId: string) {
  const trip = await tripRepository.findById(tripId);
  if (!trip) {
    throw new Error("TRIP_NOT_FOUND");
  }
  if (trip.userId !== userId) {
    throw new Error("FORBIDDEN_TRIP_ACCESS");
  }
  if (!trip.isAgentProcessing) {
    throw new Error("TRIP_NOT_PROCESSING");
  }

  // If there's an agentJobId, try to remove from BullMQ
  if (trip.agentJobId) {
    const job = await tripQueue.getJob(trip.agentJobId);
    if (job) {
      try {
        await job.remove();
      } catch (e) {
        logger.warn(
          { jobId: trip.agentJobId, error: e },
          "Failed to remove job from queue, attempting to discard",
        );
        await job.discard();
      }
    }
  }

  // Update trip status to CANCELLED and release lock
  await tripRepository.updateStatus(trip._id, "CANCELLED");
  await tripRepository.releaseLock(trip._id, trip.agentJobId || "");
  logger.info(
    { tripId, agentJobId: trip.agentJobId },
    "Trip generation cancelled via tripId fallback",
  );

  return { success: true };
}
