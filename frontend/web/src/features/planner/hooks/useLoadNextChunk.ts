/**
 * useLoadNextChunk
 *
 * Fetches the next 3-day chunk from the backend when the user scrolls near
 * the end of the last rendered chunk. Because the backend pre-generates chunks
 * eagerly, the data is almost always ready immediately (latency ≈ 0).
 *
 * Usage:
 *   const { loadedChunks, loadNextChunk, allChunksLoaded } = useLoadNextChunk(tripId, totalChunks);
 */

import { useState, useCallback } from "react";
import { apiClient } from "@/lib/axios";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-client";
import { toast } from "sonner";
import type { Trip } from "../api/trips.api";
import type { ItineraryDay } from "@/utils/schemas";

export interface UseLoadNextChunkResult {
  /** Index of the next chunk to load (0-based) */
  nextChunkIndex: number;
  /** Whether all chunks have been loaded */
  allChunksLoaded: boolean;
  /** Whether a chunk fetch is in progress */
  isLoadingChunk: boolean;
  /** Trigger loading of the next chunk */
  loadNextChunk: () => Promise<void>;
}

export function useLoadNextChunk(
  tripId: string | undefined,
  totalChunks: number,
  initialLoadedChunks = 1,
): UseLoadNextChunkResult {
  const queryClient = useQueryClient();
  const [nextChunkIndex, setNextChunkIndex] = useState(initialLoadedChunks);
  const [isLoadingChunk, setIsLoadingChunk] = useState(false);

  const allChunksLoaded = nextChunkIndex >= totalChunks;

  const loadNextChunk = useCallback(async () => {
    if (!tripId || allChunksLoaded || isLoadingChunk) return;

    setIsLoadingChunk(true);
    try {
      const response = await apiClient.get(
        `/trips/${tripId}/chunks/${nextChunkIndex}`,
      );

      if (response.data.ready) {
        // Merge new days into the cached trip data
        queryClient.setQueryData<Trip>(
          queryKeys.trips.detail(tripId),
          (old) => {
            if (!old) return old;
            const existingDays = old.itinerary ?? [];
            const newDays = (response.data.days ?? []) as ItineraryDay[];
            const existingDayNums = new Set(existingDays.map((d) => d.day));
            const uniqueNewDays = newDays.filter(
              (d) => !existingDayNums.has(d.day),
            );
            return {
              ...old,
              itinerary: [...existingDays, ...uniqueNewDays],
              chunksReady: response.data.chunksReady,
            };
          },
        );
        setNextChunkIndex((prev) => prev + 1);
      } else {
        // Chunk not ready yet — backend is still generating
        toast.info("Loading more days... please try again in a few seconds.");
      }
    } catch {
      toast.error("Could not load more days. Please try again.");
    } finally {
      setIsLoadingChunk(false);
    }
  }, [tripId, nextChunkIndex, allChunksLoaded, isLoadingChunk, queryClient]);

  return { nextChunkIndex, allChunksLoaded, isLoadingChunk, loadNextChunk };
}
