import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { makeTrip } from "@/test/factories/trip";
import type { Trip } from "@/features/planner/api/trips.api";
import DashboardPage from "../pages/DashboardPage";

const tripsState = vi.hoisted(() => ({ trips: [] as unknown[] }));

vi.mock("@/features/planner/hooks/useTrips", () => ({
  useTrips: () => ({ data: tripsState.trips, isLoading: false, error: null }),
}));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/features/planner/components/TripCard", () => ({
  TripCard: () => null,
}));
vi.mock("@/features/planner/components", () => ({
  CreateTripDialog: () => null,
}));

function totalDestinations(): string | null {
  const label = screen.getByText("Total Destinations");
  return label.parentElement?.nextElementSibling?.textContent ?? null;
}

function render(trips: Trip[]) {
  tripsState.trips = trips;
  renderWithProviders(<DashboardPage />, { route: "/dashboard" });
}

describe("DashboardPage Total Destinations", () => {
  beforeEach(() => {
    tripsState.trips = [];
  });

  it("counts the destination of a single planned trip", () => {
    render([makeTrip({ _id: "t1", destination: "Tokyo, Japan", cities: [] })]);

    expect(totalDestinations()).toBe("1");
  });

  it("counts two trips to the same city once", () => {
    render([
      makeTrip({ _id: "t1", destination: "Tokyo, Japan", cities: [] }),
      makeTrip({ _id: "t2", destination: " tokyo, japan ", cities: [] }),
    ]);

    expect(totalDestinations()).toBe("1");
  });

  it("counts trips to different cities separately", () => {
    render([
      makeTrip({ _id: "t1", destination: "Tokyo, Japan", cities: [] }),
      makeTrip({ _id: "t2", destination: "Paris, France", cities: [] }),
    ]);

    expect(totalDestinations()).toBe("2");
  });

  it("shows 0 when there are no trips", () => {
    render([]);

    expect(totalDestinations()).toBe("0");
  });
});
