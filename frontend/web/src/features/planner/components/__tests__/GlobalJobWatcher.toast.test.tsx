import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/renderWithProviders";
import { makeTrip, makeActivity } from "@/test/factories/trip";
import { useActiveJobStore } from "@/stores/useActiveJobStore";
import { GlobalJobWatcher } from "../GlobalJobWatcher";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/analytics", () => ({
  track: vi.fn(),
  trackOnce: vi.fn(),
}));
import { toast } from "sonner";

const successMock = vi.mocked(toast.success);

const itinerary = [
  {
    day: 1,
    date: "2026-06-01T00:00:00.000Z",
    activities: [makeActivity()],
  },
];

function serveCompletedJob() {
  server.use(
    http.get("*/jobs/:jobId", () =>
      HttpResponse.json({
        jobId: "job-1",
        status: "COMPLETED",
        progress: 100,
        result: { status: "COMPLETED" },
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T10:01:30.000Z",
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useActiveJobStore.getState().clearActiveJob();
  useActiveJobStore.getState().setActiveJob("job-1", "trip-1");
});

describe("GlobalJobWatcher (ready toast)", () => {
  it("waits for the itinerary to load before saying the trip is ready", async () => {
    serveCompletedJob();
    let releaseTrip!: () => void;
    const tripGate = new Promise<void>((resolve) => {
      releaseTrip = resolve;
    });
    let tripRequests = 0;
    server.use(
      http.get("*/trips/:tripId", async () => {
        tripRequests += 1;
        await tripGate;
        return HttpResponse.json({
          data: makeTrip({ _id: "trip-1", itinerary }),
        });
      }),
    );

    renderWithProviders(<GlobalJobWatcher />);

    // The job is done, and the trip is being re-fetched: still no toast.
    await waitFor(() => expect(tripRequests).toBeGreaterThan(0));
    expect(successMock).not.toHaveBeenCalled();

    releaseTrip();

    await waitFor(() =>
      expect(successMock).toHaveBeenCalledWith("Your trip is ready!"),
    );
    expect(successMock).toHaveBeenCalledTimes(1);
  });

  it("does not announce a trip whose itinerary is still empty", async () => {
    serveCompletedJob();
    let tripRequests = 0;
    server.use(
      http.get("*/trips/:tripId", () => {
        tripRequests += 1;
        return HttpResponse.json({
          data: makeTrip({ _id: "trip-1", itinerary: [] }),
        });
      }),
    );

    renderWithProviders(<GlobalJobWatcher />);

    await waitFor(() => expect(tripRequests).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 50));
    expect(successMock).not.toHaveBeenCalled();
  });
});
