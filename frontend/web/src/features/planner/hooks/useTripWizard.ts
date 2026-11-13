/**
 * Trip Wizard Hook
 *
 * Starts trip generation and handles optimistic UI.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-client";
import { createTripFromWizard } from "../api/trip-wizard.api";
import type { TripPreferences } from "@travelplan/shared";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { track } from "@/features/analytics";
import { getTripDays } from "../components/create-trip-dialog.utils";

export type UseTripWizardOptions = {
  onSuccess?: (tripId: string, jobId: string) => void;
};

export function useTripWizard(options: UseTripWizardOptions = {}) {
  const queryClient = useQueryClient();
  const { setSubscriptionSnapshot } = useSubscriptionStore();

  return useMutation({
    mutationFn: ({
      preferences,
      language,
      title,
    }: {
      preferences: TripPreferences;
      language?: string;
      title?: string;
    }) => createTripFromWizard(preferences, language, title),
    onSuccess: (response, { preferences }) => {
      track("trip_generation_requested", {
        jobId: response.jobId,
        // 0 only if the dates are broken; the catalog then refuses the event.
        durationDays:
          getTripDays(preferences.startDate, preferences.endDate) ?? 0,
        // The wizard plans one destination per trip.
        destinationCount: 1,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.lists() });
      if (response.quota) {
        const remaining = response.quota.remaining ?? 0;
        const limit = response.quota.limit ?? 10;
        const used =
          response.quota.tripsUsedThisCycle ??
          Math.max(0, (limit > 0 ? limit : 10) - remaining);
        setSubscriptionSnapshot({
          isPro: response.tier === "pro",
          tripsUsedThisCycle: used,
          tripLimit: limit,
          quotaResetsAt:
            typeof response.quota.resetAt === "string"
              ? response.quota.resetAt
              : null,
        });
      }
      toast.success("Trip queued! Your agent is getting started.");
      options.onSuccess?.(response.tripId, response.jobId);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to start trip generation");
    },
  });
}
