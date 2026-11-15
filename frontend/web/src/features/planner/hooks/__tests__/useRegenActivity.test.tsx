import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderHookWithQuery } from "@/test/renderHookWithQuery";
import { queryKeys } from "@/lib/query-client";
import { makeTrip, makeActivity } from "@/test/factories/trip";
import { useRegenActivity } from "../useRegenActivity";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
import { toast } from "sonner";

const SUBSCRIPTION_INITIAL = useSubscriptionStore.getState();

describe("useRegenActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSubscriptionStore.setState(SUBSCRIPTION_INITIAL, true);
  });

  it("blocks a free user who already hit the regen limit for this trip, without calling the API", async () => {
    let called = false;
    server.use(
      http.post("*/trips/:tripId/regen-activity", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    useSubscriptionStore.setState({
      isPro: false,
      regenUsedByTripId: { "trip-1": 5 },
    });

    const { result } = renderHookWithQuery(() => useRegenActivity());
    act(() => {
      result.current.mutate({
        tripId: "trip-1",
        dayIndex: 0,
        activityId: "a",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(called).toBe(false);
    expect(useSubscriptionStore.getState().isUpgradeModalOpen).toBe(true);
    expect(useSubscriptionStore.getState().upgradeReason).toBe("regen-limit");
  });

  it("writes the returned itinerary into the cache and updates regen usage on success", async () => {
    const newItinerary = [
      {
        day: 1,
        date: "2026-06-01T00:00:00.000Z",
        activities: [makeActivity({ _id: "a", name: "New Place" })],
      },
    ];
    server.use(
      http.post("*/trips/:tripId/regen-activity", () =>
        HttpResponse.json({ itinerary: newItinerary, regenCount: 1 }),
      ),
    );

    const { result, queryClient } = renderHookWithQuery(() =>
      useRegenActivity(),
    );
    queryClient.setQueryData(queryKeys.trips.detail("trip-1"), makeTrip());

    act(() => {
      result.current.mutate({
        tripId: "trip-1",
        dayIndex: 0,
        activityId: "a",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cached = queryClient.getQueryData(
      queryKeys.trips.detail("trip-1"),
    ) as ReturnType<typeof makeTrip> | undefined;
    expect(cached?.itinerary).toEqual(newItinerary);
    expect(useSubscriptionStore.getState().regenUsedByTripId["trip-1"]).toBe(1);
    expect(toast.success).toHaveBeenCalled();
  });

  it("warns the free user when they hit the 4th/5th regeneration", async () => {
    server.use(
      http.post("*/trips/:tripId/regen-activity", () =>
        HttpResponse.json({ itinerary: [], regenCount: 4 }),
      ),
    );
    const { result, queryClient } = renderHookWithQuery(() =>
      useRegenActivity(),
    );
    queryClient.setQueryData(queryKeys.trips.detail("trip-1"), makeTrip());

    act(() => {
      result.current.mutate({
        tripId: "trip-1",
        dayIndex: 0,
        activityId: "a",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.info).toHaveBeenCalled();
  });

  it("shows the translated fallback, not the server text, on NO_ALTERNATIVE_FOUND (422)", async () => {
    server.use(
      http.post("*/trips/:tripId/regen-activity", () =>
        HttpResponse.json(
          { message: "No unique alternative found" },
          { status: 422 },
        ),
      ),
    );
    const { result } = renderHookWithQuery(() => useRegenActivity());

    act(() => {
      result.current.mutate({
        tripId: "trip-1",
        dayIndex: 0,
        activityId: "a",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith(
      "Could not find a unique replacement. Try again.",
    );
  });
});
