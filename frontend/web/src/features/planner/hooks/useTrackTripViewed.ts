import { useEffect, useRef } from "react";
import { track } from "@/features/analytics";

/**
 * Tracks trip_viewed once per trip the page shows. Re-renders, refetches
 * and StrictMode's effect replay keep the ref, so they do not count again.
 */
export function useTrackTripViewed(tripId: string | undefined): void {
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (!tripId || lastTracked.current === tripId) return;
    lastTracked.current = tripId;
    track("trip_viewed", { tripId });
  }, [tripId]);
}
