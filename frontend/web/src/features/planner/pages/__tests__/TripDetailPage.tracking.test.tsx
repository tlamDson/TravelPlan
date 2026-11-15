import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectCatalogValid } from "@/test/analytics";
import { makeTrip } from "@/test/factories/trip";
import TripDetailPage from "../TripDetailPage";

/**
 * The page, not just the hook: if TripDetailPage stops calling
 * useTrackTripViewed, trip_viewed goes dark and only this test notices.
 */
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));
vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({ user: null, isLoaded: true }),
  useAuth: () => ({ isLoaded: true, userId: null }),
}));
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/features/analytics", () => ({
  track: vi.fn(),
  trackOnce: vi.fn(),
}));
import { track } from "@/features/analytics";

const trackMock = vi.mocked(track);

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/trips/:tripId" element={<TripDetailPage />} />
    </Routes>,
    { route: "/trips/trip-1" },
  );
}

beforeEach(() => {
  trackMock.mockClear();
});

describe("TripDetailPage (trip_viewed)", () => {
  it("tracks the trip once it has loaded", async () => {
    server.use(
      http.get("*/trips/:tripId", () =>
        HttpResponse.json({ data: makeTrip({ _id: "trip-1" }) }),
      ),
    );

    renderPage();

    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith("trip_viewed", {
        tripId: "trip-1",
      }),
    );
    expect(
      trackMock.mock.calls.filter(([name]) => name === "trip_viewed"),
    ).toHaveLength(1);
    expectCatalogValid(trackMock.mock.calls);
  });

  it("does not track a trip that failed to load", async () => {
    server.use(
      http.get("*/trips/:tripId", () =>
        HttpResponse.json({ message: "not found" }, { status: 404 }),
      ),
    );

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("layout")).toBeInTheDocument(),
    );
    expect(trackMock).not.toHaveBeenCalledWith(
      "trip_viewed",
      expect.anything(),
    );
  });
});

describe("TripDetailPage (empty itinerary)", () => {
  it("points to the trips wizard instead of the unreleased AI Assistant", async () => {
    server.use(
      http.get("*/trips/:tripId", () =>
        HttpResponse.json({ data: makeTrip({ _id: "trip-1", itinerary: [] }) }),
      ),
    );

    renderPage();

    const cta = await screen.findByTestId("trip-empty-itinerary-cta");
    expect(cta).toHaveAttribute("href", "/trips");
    expect(screen.queryByText(/AI Assistant/i)).not.toBeInTheDocument();
  });
});
