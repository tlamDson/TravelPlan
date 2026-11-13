import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { TripPreferences } from "@travelplan/shared";
import { server } from "@/test/msw/server";
import { renderHookWithQuery } from "@/test/renderHookWithQuery";
import { expectCatalogValid } from "@/test/analytics";
import { makeTrip, makeActivity } from "@/test/factories/trip";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { useTripWizard } from "../useTripWizard";
import { useReorderActivities } from "../useReorderActivities";
import { useRegenActivity } from "../useRegenActivity";
import { useUpdateTrip } from "../useTrips";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/features/analytics", () => ({
  track: vi.fn(),
  trackOnce: vi.fn(),
}));
import { track } from "@/features/analytics";

const trackMock = vi.mocked(track);
const SUBSCRIPTION_INITIAL = useSubscriptionStore.getState();

const preferences = {
  destination: "Da Nang, Vietnam",
  startDate: "2026-06-01T00:00:00.000Z",
  endDate: "2026-06-04T00:00:00.000Z",
  budget: { total: 1000, currency: "USD" },
  travelers: { adults: 2, children: 0 },
  accommodationType: "any",
} as unknown as TripPreferences;

beforeEach(() => {
  vi.clearAllMocks();
  useSubscriptionStore.setState(SUBSCRIPTION_INITIAL, true);
});

describe("trip_generation_requested", () => {
  it("is tracked with the queued jobId once the API accepts the wizard", async () => {
    server.use(
      http.post("*/trips", () =>
        HttpResponse.json({ success: true, jobId: "job-1", tripId: "trip-1" }),
      ),
    );
    const { result } = renderHookWithQuery(() => useTripWizard());

    act(() => {
      result.current.mutate({ preferences, title: "Weekend" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(trackMock).toHaveBeenCalledWith("trip_generation_requested", {
      jobId: "job-1",
      durationDays: 3,
      destinationCount: 1,
    });
    expectCatalogValid(trackMock.mock.calls);
  });

  it("is not tracked when the API refuses the wizard", async () => {
    server.use(
      http.post("*/trips", () =>
        HttpResponse.json({ message: "quota" }, { status: 429 }),
      ),
    );
    const { result } = renderHookWithQuery(() => useTripWizard());

    act(() => {
      result.current.mutate({ preferences });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(trackMock).not.toHaveBeenCalled();
  });
});

describe("itinerary_edited", () => {
  const trip = makeTrip({
    itinerary: [
      {
        day: 1,
        date: "2026-06-01T00:00:00.000Z",
        activities: [
          makeActivity({ _id: "a", order: 0 }),
          makeActivity({ _id: "b", order: 1 }),
        ],
      },
      {
        day: 2,
        date: "2026-06-02T00:00:00.000Z",
        activities: [
          makeActivity({ _id: "c", order: 0 }),
          makeActivity({ _id: "d", order: 1 }),
        ],
      },
    ],
  });

  it("is tracked as a reorder of the day once the server saves the order", async () => {
    server.use(
      http.patch("*/trips/:tripId/reorder-activities", () =>
        HttpResponse.json({ itinerary: trip.itinerary }),
      ),
    );
    const { result } = renderHookWithQuery(() => useReorderActivities());

    act(() => {
      result.current.mutate({
        tripId: "trip-1",
        dayIndex: 1,
        orderedActivityIds: ["d", "c"],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(trackMock).toHaveBeenCalledWith("itinerary_edited", {
      tripId: "trip-1",
      editType: "reorder",
      dayIndex: 1,
    });
    expectCatalogValid(trackMock.mock.calls);
  });

  it("is not tracked when the reorder is rolled back", async () => {
    server.use(
      http.patch("*/trips/:tripId/reorder-activities", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    const { result } = renderHookWithQuery(() => useReorderActivities());

    act(() => {
      result.current.mutate({
        tripId: "trip-1",
        dayIndex: 0,
        orderedActivityIds: ["b", "a"],
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("is tracked as a regenerated activity once the replacement arrives", async () => {
    useSubscriptionStore.setState({ isPro: true });
    server.use(
      http.post("*/trips/:tripId/regen-activity", () =>
        HttpResponse.json({ itinerary: trip.itinerary, regenCount: 1 }),
      ),
    );
    const { result } = renderHookWithQuery(() => useRegenActivity());

    act(() => {
      result.current.mutate({ tripId: "trip-1", dayIndex: 0, activityId: "a" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(trackMock).toHaveBeenCalledWith("itinerary_edited", {
      tripId: "trip-1",
      editType: "regenerate_activity",
      dayIndex: 0,
    });
    expectCatalogValid(trackMock.mock.calls);
  });

  it("is not tracked when a free user is stopped by the regen limit", async () => {
    useSubscriptionStore.setState({
      isPro: false,
      regenUsedByTripId: { "trip-1": 5 },
    });
    const { result } = renderHookWithQuery(() => useRegenActivity());

    act(() => {
      result.current.mutate({ tripId: "trip-1", dayIndex: 0, activityId: "a" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(trackMock).not.toHaveBeenCalled();
  });
});

describe("trip_saved", () => {
  it("is tracked when the user's changes to the trip are saved", async () => {
    server.use(
      http.patch("*/trips/:tripId", () =>
        HttpResponse.json({ data: makeTrip({ title: "Renamed" }) }),
      ),
    );
    const { result } = renderHookWithQuery(() => useUpdateTrip());

    act(() => {
      result.current.mutate({ tripId: "trip-1", data: { title: "Renamed" } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(trackMock).toHaveBeenCalledWith("trip_saved", { tripId: "trip-1" });
    expectCatalogValid(trackMock.mock.calls);
  });

  it("is not tracked when the save fails", async () => {
    server.use(
      http.patch("*/trips/:tripId", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    const { result } = renderHookWithQuery(() => useUpdateTrip());

    act(() => {
      result.current.mutate({ tripId: "trip-1", data: { title: "Renamed" } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(trackMock).not.toHaveBeenCalled();
  });
});
