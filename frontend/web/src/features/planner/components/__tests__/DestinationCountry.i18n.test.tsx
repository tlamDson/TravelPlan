import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { makeTrip } from "@/test/factories/trip";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { TripCard } from "../TripCard";
import { TripDetailSummaryRail } from "../trip-detail/TripDetailSummaryRail";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ signOut: vi.fn(), isLoaded: true, userId: null }),
  useUser: () => ({ user: null, isLoaded: true }),
}));
vi.mock(
  "@/features/planner/components/trip-detail/TripDetailWeatherPanel",
  () => ({ TripDetailWeatherPanel: () => null }),
);

describe("country names follow the UI language", () => {
  beforeEach(() => useTranslationStore.setState({ language: "Vietnamese" }));
  afterEach(() => useTranslationStore.setState({ language: "English (US)" }));

  it("trip card shows the country in Vietnamese", () => {
    const trip = makeTrip({
      title: "Trip to Kyoto, Japan",
      destination: "Kyoto, Japan",
    });
    renderWithProviders(<TripCard trip={trip} />);

    expect(screen.getByTestId("trip-card-title")).toHaveTextContent(
      /Kyoto, Nhật Bản$/,
    );
  });

  it("trip summary shows the country in Vietnamese", () => {
    renderWithProviders(
      <TripDetailSummaryRail
        tripId="trip-1"
        destination="Kyoto, Japan"
        activeDayCoordinates={[]}
        allTripCoordinates={[]}
        dateRange="1 thg 6 – 4 thg 6"
        totalCalendarDays={4}
        totalStops={12}
        budgetTotal={500}
        budgetCurrency="USD"
        preferredCurrency="VND"
        showViewOnMap
        onViewMap={() => {}}
      />,
    );

    expect(screen.getByText("Kyoto, Nhật Bản")).toBeInTheDocument();
    expect(screen.queryByText(/Japan/)).toBeNull();
  });
});
