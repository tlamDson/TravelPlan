import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useEffect } from "react";
import { getAnalyticsSessionId } from "@/features/analytics";
import { createBrowserLogger } from "@/lib/logger";
import {
  getExperimentAssignments,
  postExperimentExposure,
} from "../api/experiments.api";
import { claimExposure, releaseExposure } from "../lib/exposure-registry";

const logger = createBrowserLogger("experiments");

export const experimentQueryKeys = {
  assignments: (userId: string | null) =>
    ["experiments", "assignments", userId] as const,
};

export interface UseExperimentResult {
  /**
   * The assigned variant (may be "holdout"), or null when there is no
   * assignment: signed out, experiment not running, experiments off, or the
   * request failed. Render the default experience for anything you don't
   * recognise.
   */
  variant: string | null;
  /** True until Clerk and the assignments request settle. */
  isLoading: boolean;
}

/**
 * The signed-in user's variant in `experimentKey`. The first render of an
 * assigned variant in this analytics session logs one exposure through the
 * server; pass `expose: false` to read the variant without exposing (e.g.
 * when the variant isn't on screen yet).
 */
export function useExperiment(
  experimentKey: string,
  opts: { expose?: boolean } = {},
): UseExperimentResult {
  const expose = opts.expose ?? true;
  const { isLoaded, isSignedIn, userId } = useAuth();
  const enabled = isLoaded && Boolean(isSignedIn) && Boolean(userId);

  const query = useQuery({
    queryKey: experimentQueryKeys.assignments(userId ?? null),
    queryFn: getExperimentAssignments,
    enabled,
    // Assignment is deterministic; don't flip a variant mid-visit.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    // 404 means experiments are off; a failure just renders the default.
    retry: false,
  });

  const variant =
    query.data?.find((a) => a.experimentKey === experimentKey)?.variant ?? null;

  useEffect(() => {
    if (!expose || !variant || !userId) return;
    const sessionId = getAnalyticsSessionId();
    const claim = { experimentKey, sessionId, userId };
    if (!claimExposure(claim)) return;
    postExperimentExposure({ experimentKey, sessionId }).catch(
      (err: unknown) => {
        releaseExposure(claim);
        // Status only: an axios error carries the Authorization header.
        const status = isAxiosError(err) ? err.response?.status : undefined;
        logger.warn(
          { status, experimentKey },
          "experiment exposure not logged",
        );
      },
    );
  }, [expose, variant, userId, experimentKey]);

  if (!isLoaded) return { variant: null, isLoading: true };
  if (!enabled) return { variant: null, isLoading: false };
  return { variant, isLoading: query.isPending };
}
