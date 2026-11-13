import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useActiveJobStore } from "@/stores/useActiveJobStore";
import { useJobPoller } from "@/features/planner/hooks";
import { queryKeys } from "@/lib/query-client";
import { trackOnce } from "@/features/analytics";
import type { Job } from "@/utils/schemas";
import { toGenerationCompleted } from "../utils/generation-outcome";

export function GlobalJobWatcher() {
  const { activeJobId, tripId, clearActiveJob } = useActiveJobStore();
  const queryClient = useQueryClient();

  /** The poller caches the final job before it calls back. */
  const trackFinished = () => {
    if (!activeJobId || !tripId) return;
    const job = queryClient.getQueryData<Job>(
      queryKeys.jobs.detail(activeJobId),
    );
    if (!job) return;
    // Once per job: the watcher remounts with every page and can see the
    // same finished job again.
    trackOnce(
      "trip_generation_completed",
      toGenerationCompleted(job, tripId),
      job.jobId,
    );
  };

  useJobPoller({
    jobId: activeJobId,
    onComplete: () => {
      trackFinished();
      toast.success("Your trip is ready!");
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.lists() });
      if (tripId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.trips.detail(tripId),
        });
      }
      clearActiveJob();
    },
    onError: (err) => {
      trackFinished();
      toast.error(err || "Failed to create itinerary");
      clearActiveJob();
    },
  });

  return null;
}
