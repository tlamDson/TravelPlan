import { tripRepository } from "../repositories/trip.repository";
import { tripQueue } from "../trip.queue";

// Re-exported for backward compatibility — planner.service.ts and callers
// import these from here. Implementations moved out (Rule of 200) when
// this file grew past 200 lines carrying the retry-path job-options fix.
export { retryTripJobForUser } from "./trip-retry.service";
export { cancelTripJobForUser, cancelTripForUser } from "./trip-cancel.service";

type JobStatus = "IDLE" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

const JOB_STATE_TO_STATUS: Record<string, JobStatus> = {
  completed: "COMPLETED",
  failed: "FAILED",
  active: "PROCESSING",
  waiting: "QUEUED",
  delayed: "QUEUED",
  paused: "QUEUED",
  "waiting-children": "QUEUED",
  prioritized: "QUEUED",
};

export function mapJobState(state: string): JobStatus {
  return JOB_STATE_TO_STATUS[state] ?? "IDLE";
}

export function normalizeProgress(progress: unknown): {
  percent: number;
  currentStep?: string;
} {
  if (typeof progress === "number") {
    return { percent: progress };
  }

  if (progress && typeof progress === "object") {
    const data = progress as { percent?: number; currentStep?: string };
    const percent = typeof data.percent === "number" ? data.percent : 0;
    if (typeof data.currentStep === "string") {
      return { percent, currentStep: data.currentStep };
    }
    return { percent };
  }

  return { percent: 0 };
}

/**
 * Get job status (for polling)
 */
export async function getJobStatusForUser(jobId: string, userId: string) {
  const job = await tripQueue.getJob(jobId);
  if (!job) {
    // If the job is missing from BullMQ (e.g. cancelled/discarded), check DB
    // We assume the caller knows the trip ID, or we fall back to searching by agentJobId
    const trip = await tripRepository.findByJobId(jobId);
    if (trip && trip.userId === userId && trip.status === "CANCELLED") {
      return {
        jobId,
        status: "CANCELLED",
        progress: 0,
        currentStep: "User cancelled the request",
        result: null,
        error: null,
        createdAt: trip.createdAt.toISOString(),
        updatedAt: trip.updatedAt.toISOString(),
      };
    }
    return null;
  }

  const jobUserId = (job.data as { userId?: string })?.userId;
  if (jobUserId && jobUserId !== userId) {
    throw new Error("FORBIDDEN_JOB_ACCESS");
  }

  const state = await job.getState();
  const { percent, currentStep } = normalizeProgress(job.progress);
  const status = mapJobState(state);
  const error =
    state === "failed" ? job.failedReason || "Job failed" : undefined;
  const result = state === "completed" ? job.returnvalue : undefined;

  return {
    jobId: String(job.id),
    status,
    progress: percent,
    currentStep,
    result,
    error,
    createdAt: new Date(job.timestamp).toISOString(),
    updatedAt: new Date(
      job.finishedOn ?? job.processedOn ?? job.timestamp,
    ).toISOString(),
  };
}

/**
 * Get trip by ID (for polling)
 */
export async function getTripByIdFromRepo(tripId: string) {
  return tripRepository.findById(tripId);
}

/**
 * Get user's trips
 */
export async function getUserTripsList(
  userId: string,
  options?: { status?: string; limit?: number },
) {
  return tripRepository.findByUserId(userId, options);
}
