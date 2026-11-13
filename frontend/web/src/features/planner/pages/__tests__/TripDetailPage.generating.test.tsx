import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/renderWithProviders";
import { makeTrip } from "@/test/factories/trip";
import TripDetailPage from "../TripDetailPage";

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

function renderTrip(overrides: Parameters<typeof makeTrip>[0]) {
  server.use(
    http.get("*/trips/:tripId", () =>
      HttpResponse.json({ data: makeTrip({ _id: "trip-1", ...overrides }) }),
    ),
  );
  return renderWithProviders(
    <Routes>
      <Route path="/trips/:tripId" element={<TripDetailPage />} />
    </Routes>,
    { route: "/trips/trip-1" },
  );
}

describe("TripDetailPage (empty itinerary)", () => {
  it.each([
    ["queued before the worker takes the lock", { status: "QUEUED" }],
    ["processing", { status: "PROCESSING", isAgentProcessing: true }],
  ])(
    "shows a generating state, not the empty state, while %s",
    async (_label, overrides) => {
      renderTrip({ itinerary: [], ...overrides });

      expect(
        await screen.findByTestId("trip-generating-state"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("trip-empty-itinerary-cta"),
      ).not.toBeInTheDocument();
    },
  );

  it("still shows the empty state for a finished trip with no itinerary", async () => {
    renderTrip({ itinerary: [], status: "COMPLETED" });

    expect(
      await screen.findByTestId("trip-empty-itinerary-cta"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("trip-generating-state"),
    ).not.toBeInTheDocument();
  });
});
