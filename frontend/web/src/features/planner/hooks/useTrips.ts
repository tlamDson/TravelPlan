/**
 * Trips Hooks
 *
 * Section 6: TanStack Query for Server State
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-client";
import { track } from "@/features/analytics";
import * as tripsApi from "../api/trips.api";
import type {
  CreateTripRequest,
  UpdateTripRequest,
  Trip,
} from "../api/trips.api";

// ============================================
// QUERIES
// ============================================

/**
 * Get all trips
 */
export function useTrips(params?: { status?: string }) {
  return useQuery({
    queryKey: queryKeys.trips.list(params || {}),
    queryFn: () => tripsApi.getTrips(params),
  });
}

/**
 * Get single trip by ID
 */
export function useTrip(tripId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.trips.detail(tripId || ""),
    queryFn: () => tripsApi.getTrip(tripId!),
    enabled: !!tripId,
  });
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Create trip mutation
 */
export function useCreateTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTripRequest) => tripsApi.createTrip(data),
    onSuccess: (newTrip) => {
      // Invalidate trips list
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.lists() });
      // Pre-populate the detail cache
      queryClient.setQueryData(queryKeys.trips.detail(newTrip._id), newTrip);
      toast.success("Trip created successfully!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create trip");
    },
  });
}

/**
 * Update trip mutation
 */
export function useUpdateTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tripId,
      data,
    }: {
      tripId: string;
      data: UpdateTripRequest;
    }) => tripsApi.updateTrip(tripId, data),
    onSuccess: (updatedTrip) => {
      track("trip_saved", { tripId: updatedTrip._id });
      // Update cache
      queryClient.setQueryData(
        queryKeys.trips.detail(updatedTrip._id),
        updatedTrip,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.lists() });
      toast.success("Trip updated!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update trip");
    },
  });
}

/**
 * Delete trip mutation
 */
export function useDeleteTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tripId: string) => tripsApi.deleteTrip(tripId),
    onSuccess: (_, tripId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: queryKeys.trips.detail(tripId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.lists() });
      toast.success("Trip deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete trip");
    },
  });
}

/**
 * Update budget mutation with optimistic update
 */
export function useUpdateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tripId,
      category,
      amount,
    }: {
      tripId: string;
      category: string;
      amount: number;
    }) => tripsApi.updateBudgetSpent(tripId, category, amount),
    onMutate: async ({ tripId, category, amount }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.trips.detail(tripId),
      });

      // Snapshot previous value
      const previousTrip = queryClient.getQueryData(
        queryKeys.trips.detail(tripId),
      );

      // Optimistically update
      queryClient.setQueryData(
        queryKeys.trips.detail(tripId),
        (old: Trip | undefined) => {
          if (!old) return old;
          return {
            ...old,
            budget: {
              ...old.budget,
              totalSpent: (old.budget?.totalSpent || 0) + amount,
              breakdown: (old.budget?.breakdown || []).map(
                (cat: { name: string; spent: number }) =>
                  cat.name === category
                    ? { ...cat, spent: cat.spent + amount }
                    : cat,
              ),
            },
          };
        },
      );

      return { previousTrip };
    },
    onError: (_err, { tripId }, context) => {
      // Rollback on error
      if (context?.previousTrip) {
        queryClient.setQueryData(
          queryKeys.trips.detail(tripId),
          context.previousTrip,
        );
      }
      toast.error("Failed to update budget");
    },
    onSettled: (_, __, { tripId }) => {
      // Refetch to ensure sync
      queryClient.invalidateQueries({
        queryKey: queryKeys.trips.detail(tripId),
      });
    },
  });
}
/**
 * Update trip lifecycle mutation
 */
export function useUpdateTripLifecycle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tripId,
      lifecycle,
    }: {
      tripId: string;
      lifecycle: import("@travelplan/shared").TripLifecycle;
    }) => {
      return tripsApi.updateTripLifecycle(tripId, lifecycle);
    },
    onSuccess: (updatedTrip) => {
      // Update cache
      queryClient.setQueryData(
        queryKeys.trips.detail(updatedTrip._id),
        updatedTrip,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.lists() });
      toast.success(
        `Trip marked as ${updatedTrip.lifecycle.replace("_", " ").toLowerCase()}`,
      );
    },
    onError: (error: Error) => {
      console.error("[lifecycle] ❌ Error:", error.message);
      toast.error(error.message || "Failed to update trip status");
    },
  });
}
