/**
 * useReorderActivities
 *
 * Mutation hook for drag-and-drop activity reordering.
 * Applies an optimistic update so the UI feels instant, then syncs to the server.
 * Rolls back on failure.
 *
 * Guard: skips the network call when the order hasn't actually changed —
 *        this matches the three-check pattern on onDragEnd in TripDetailPage.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-client";
import { apiClient } from "@/lib/axios";
import type { Trip } from "../api/trips.api";
import { track } from "@/features/analytics";

interface ReorderParams {
  tripId: string;
  dayIndex: number;
  orderedActivityIds: string[];
}

async function reorderActivitiesApi({
  tripId,
  dayIndex,
  orderedActivityIds,
}: ReorderParams): Promise<Trip["itinerary"]> {
  const res = await apiClient.patch(`/trips/${tripId}/reorder-activities`, {
    dayIndex,
    orderedActivityIds,
  });
  return res.data.itinerary;
}

export function useReorderActivities() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reorderActivitiesApi,

    onMutate: async ({ tripId, dayIndex, orderedActivityIds }) => {
      // Cancel any in-flight refetches to avoid overwriting the optimistic state
      await queryClient.cancelQueries({ queryKey: queryKeys.trips.detail(tripId) });

      const previousTrip = queryClient.getQueryData<Trip>(
        queryKeys.trips.detail(tripId),
      );

      // Optimistically reorder the activities in the local cache
      queryClient.setQueryData<Trip>(queryKeys.trips.detail(tripId), (old) => {
        if (!old) return old;

        const newItinerary = old.itinerary.map((day, idx) => {
          if (idx !== dayIndex) return day;

          const activityMap = new Map(day.activities.map((a) => [a._id!, a]));
          const reordered = orderedActivityIds
            .map((id, order) => {
              const act = activityMap.get(id);
              return act ? { ...act, order } : null;
            })
            .filter(Boolean) as typeof day.activities;

          return { ...day, activities: reordered };
        });

        return { ...old, itinerary: newItinerary };
      });

      return { previousTrip };
    },

    onError: (_err, { tripId }, context) => {
      // Rollback to the snapshot taken before the optimistic update
      if (context?.previousTrip) {
        queryClient.setQueryData(queryKeys.trips.detail(tripId), context.previousTrip);
      }
      toast.error("Failed to save new order. Changes reverted.");
    },

    onSuccess: (newItinerary, { tripId, dayIndex }) => {
      track("itinerary_edited", { tripId, editType: "reorder", dayIndex });
      // Sync server truth into the cache
      queryClient.setQueryData<Trip>(queryKeys.trips.detail(tripId), (old) => {
        if (!old) return old;
        return { ...old, itinerary: newItinerary };
      });
    },
  });
}
