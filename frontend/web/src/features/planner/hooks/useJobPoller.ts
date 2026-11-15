/**
 * Job Polling Hook
 *
 * Section 2.1: The Polling Pattern
 *
 * When triggering a long-running Agent task:
 * 1. Trigger: POST request returns { jobId }
 * 2. Poll: Use react-query to poll /jobs/:id, backing off from 1s to 5s
 *    (see utils/poll-backoff.ts) so a long generation stays under the API
 *    rate limit; paused while the tab is hidden unless keepAliveInBackground
 * 3. States: Handle 4 distinct states: IDLE -> QUEUED -> PROCESSING -> COMPLETED
 *
 * Section 7: Testing - Accepts mockStatus prop for testing UI states
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/axios";
import { queryKeys } from "@/lib/query-client";
import { jobSchema, type Job, type JobStatus } from "@/utils/schemas";
import { validateAPI } from "@/utils/validation";
import {
  getPollDelay,
  POLL_INITIAL_INTERVAL_MS,
  POLL_MAX_INTERVAL_MS,
} from "../utils/poll-backoff";

// ============================================
// TYPES
// ============================================

export interface UseJobPollerOptions {
  /** Job ID to poll */
  jobId: string | null;
  /** First polling interval in ms; later polls back off (default: 1000) */
  interval?: number;
  /** Polling interval cap in ms (default: 5000) */
  maxInterval?: number;
  /** Callback when job completes */
  onComplete?: (result: unknown) => void;
  /** Callback when job fails */
  onError?: (error: string) => void;
  /** Mock status for testing (Section 7) */
  mockStatus?: JobStatus;
  /** Mock progress for testing */
  mockProgress?: number;
  /** Mock current step for testing */
  mockCurrentStep?: string;
  /**
   * Keep polling even when the browser tab is hidden (Pro users).
   * Default: false (pauses when tab is not visible).
   */
  keepAliveInBackground?: boolean;
}

export interface JobPollerState {
  status: JobStatus;
  progress: number;
  currentStep: string | null;
  result: unknown | null;
  error: string | null;
  isPolling: boolean;
}

// ============================================
// API FUNCTION
// ============================================

async function fetchJobStatus(jobId: string): Promise<Job> {
  const response = await apiClient.get(`/jobs/${jobId}`);
  const job = validateAPI(
    jobSchema,
    response.data.data || response.data,
    "fetchJobStatus",
  );
  // 📌 LOG POINT D — every poll tick visible in browser console (dev only)
  if (import.meta.env.DEV) {
    console.log(
      `📡 [POLL] jobId=${jobId} | status=${job.status} | progress=${job.progress}% | step=${job.currentStep ?? "-"}`,
      job,
    );
  }
  return job;
}

// ============================================
// HOOK
// ============================================

/**
 * Poll for job status updates
 *
 * @example
 * const { status, progress, currentStep } = useJobPoller({
 *   jobId: "abc123",
 *   onComplete: (result) => console.log("Done!", result),
 * });
 *
 * // For testing:
 * const { status } = useJobPoller({
 *   jobId: null,
 *   mockStatus: "PROCESSING",
 *   mockProgress: 50,
 *   mockCurrentStep: "Analyzing weather data...",
 * });
 */
export function useJobPoller({
  jobId,
  interval = POLL_INITIAL_INTERVAL_MS,
  maxInterval = POLL_MAX_INTERVAL_MS,
  onComplete,
  onError,
  mockStatus,
  mockProgress,
  mockCurrentStep,
  keepAliveInBackground = false,
}: UseJobPollerOptions): JobPollerState {
  const queryClient = useQueryClient();

  // Determine if we're in mock mode
  const isMockMode = mockStatus !== undefined;

  // Track completion state via the job data itself, not separate state
  const { data: job, isLoading } = useQuery({
    queryKey: queryKeys.jobs.detail(jobId || "no-job"),
    queryFn: () => fetchJobStatus(jobId!),
    enabled: !isMockMode && !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop only when truly COMPLETED or FAILED (not DELAYED — that means retry pending)
      if (data?.status === "COMPLETED" || data?.status === "FAILED") {
        return false;
      }
      // Back off by the number of polls already answered for this job
      // (errors included, so a failing endpoint is not hammered at 1s).
      const { dataUpdateCount, errorUpdateCount } = query.state;
      const pollsDone = dataUpdateCount + errorUpdateCount;
      return getPollDelay(Math.max(0, pollsDone - 1), interval, maxInterval);
    },
    refetchIntervalInBackground: keepAliveInBackground,
  });

  // Derive completion from job data — DELAYED is NOT complete (BullMQ retry pending)
  const isComplete = job?.status === "COMPLETED" || job?.status === "FAILED";

  // Handle completion callbacks
  useEffect(() => {
    if (isMockMode || !job) return;

    if (job.status === "COMPLETED") {
      // 📌 LOG POINT E — final result that becomes the itinerary on the page
      if (import.meta.env.DEV) {
        console.log(
          "🎉 [JOB COMPLETE] Final result from AI pipeline:",
          job.result,
        );
      }
      onComplete?.(job.result);
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    } else if (job.status === "FAILED") {
      console.error("❌ [JOB FAILED] Error:", job.error);
      onError?.(job.error || "Job failed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    job?.status,
    job?.result,
    job?.error,
    onComplete,
    onError,
    queryClient,
    isMockMode,
  ]);

  // Return mock state for testing (Section 7)
  if (isMockMode) {
    return {
      status: mockStatus,
      progress: mockProgress ?? (mockStatus === "COMPLETED" ? 100 : 0),
      currentStep: mockCurrentStep ?? null,
      result: mockStatus === "COMPLETED" ? { mock: true } : null,
      error: mockStatus === "FAILED" ? "Mock error" : null,
      isPolling: mockStatus === "PROCESSING" || mockStatus === "QUEUED",
    };
  }

  // Return idle state if no jobId
  if (!jobId) {
    return {
      status: "IDLE",
      progress: 0,
      currentStep: null,
      result: null,
      error: null,
      isPolling: false,
    };
  }

  // BullMQ's "delayed"/"waiting" states are already collapsed to "QUEUED"
  // server-side (trip-status.service.ts's JOB_STATE_TO_STATUS) before the
  // response is serialized, and jobStatusSchema doesn't include "DELAYED"/
  // "WAITING" — the wire format never carries them, so there is nothing to
  // normalise here.
  const rawStatus = job?.status || (isLoading ? "QUEUED" : "IDLE");

  return {
    status: rawStatus,
    progress: job?.progress || 0,
    currentStep: job?.currentStep || null,
    result: job?.result || null,
    error: job?.error || null,
    isPolling: !isComplete && !!jobId,
  };
}

// ============================================
// TRIGGER JOB HOOK
// ============================================

/**
 * Hook to trigger a new agent job
 * Returns mutation to start job and jobId for polling
 */
export function useTriggerJob() {
  const [jobId, setJobId] = useState<string | null>(null);

  const trigger = useCallback(async (endpoint: string, data: unknown) => {
    const response = await apiClient.post(endpoint, data);
    const newJobId = response.data.jobId;
    setJobId(newJobId);
    return newJobId;
  }, []);

  const reset = useCallback(() => {
    setJobId(null);
  }, []);

  return { jobId, trigger, reset };
}
