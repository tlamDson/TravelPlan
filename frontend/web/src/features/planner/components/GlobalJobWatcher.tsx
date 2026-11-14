import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useActiveJobStore } from "@/stores/useActiveJobStore";
import { useJobPoller } from "@/features/planner/hooks";
import { queryKeys } from "@/lib/query-client";
import { trackOnce } from "@/features/analytics";
import type { Job } from "@/utils/schemas";
import { toGenerationCompleted } from "../utils/generation-outcome";
import { getTrip } from "../api/trips.api";

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

  /**
   * A finished job does not mean the page has the plan yet: re-fetch the trip
   * and only announce it once the itinerary is actually there.
   */
  const announceWhenLoaded = async (finishedTripId: string) => {
    try {
      const trip = await queryClient.fetchQuery({
        queryKey: queryKeys.trips.detail(finishedTripId),
        queryFn: () => getTrip(finishedTripId),
        staleTime: 0,
      });
      if (trip.itinerary.length > 0) toast.success("Your trip is ready!");
    } catch {
      // The trip page shows its own load error; do not claim success.
    }
  };

  useJobPoller({
    jobId: activeJobId,
    onComplete: () => {
      trackFinished();
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.lists() });
      if (tripId) void announceWhenLoaded(tripId);
      else toast.success("Your trip is ready!");
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
