import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { TooltipProvider } from "@/components/ui/tooltip";
import { renderWithProviders } from "@/test/renderWithProviders";
import { makeActivity, makeTrip } from "@/test/factories/trip";
import { findEnglishLeaks } from "@/test/englishLeaks";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ItineraryDay } from "@/utils/schemas";
import { ItineraryDayCard } from "../ItineraryDayCard";
import { TripCard } from "../TripCard";
import { TripDetailDayStrip } from "../trip-detail/TripDetailDayStrip";
import { TripDetailSummaryRail } from "../trip-detail/TripDetailSummaryRail";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SettingsModal } from "@/features/settings/components/SettingsModal";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ signOut: vi.fn(), isLoaded: true, userId: null }),
  useUser: () => ({ user: null, isLoaded: true }),
}));
// Hoisted so useUserMe returns a stable object (a fresh one per render loops
// DashboardLayout's snapshot effect).
const { ME } = vi.hoisted(() => ({
  ME: {
    data: {
      tier: "free",
      usage: {
        tripsUsedThisCycle: 1,
        tripLimit: 10,
        quotaResetsAt: new Date(Date.now() + 18 * 86_400_000).toISOString(),
      },
    },
  },
}));
vi.mock("@/features/user/hooks/useUser", () => ({ useUserMe: () => ME }));
vi.mock("@/features/planner/components/GlobalJobWatcher", () => ({
  GlobalJobWatcher: () => null,
}));
vi.mock(
  "@/features/planner/components/trip-detail/TripDetailWeatherPanel",
  () => ({ TripDetailWeatherPanel: () => null }),
);
// The settings pages have their own i18n; this test covers the modal shell.
vi.mock("@/features/settings/pages/PersonalInfoSettings", () => ({
  PersonalInfoSettings: () => null,
}));

/** English source strings reported leaking in the vi planner (2026-11-13). */
const HARDCODED_ENGLISH = [
  /\bday\b/i,
  /\bactivit(y|ies)\b/i,
  /view on map/i,
  /\b(stay|transport|custom)\b/i,
  /\b(breakfast|lunch|dinner)\b/i,
  /nearby picks|suggestions?\b/i,
  /-day trip/i,
  /\bbudget\b/i,
  /calendar days?/i,
  /stops & activities/i,
  /free trips used/i,
  /resets in/i,
  /^close$/i,
  /auto-load/i,
  /upcoming chunks/i,
  /\b(confirmed|completed|cancelled)\b/i,
];

const leaks = (root: HTMLElement) =>
  findEnglishLeaks(root, "Vietnamese", HARDCODED_ENGLISH);

const DAY: ItineraryDay = {
  _id: "day-1",
  day: 1,
  date: "2026-06-01T00:00:00.000Z",
  activities: [
    makeActivity({
      _id: "a0",
      name: "Cà phê Vợt",
      notes: "Breakfast",
      time: "07:00",
      order: 0,
    }),
    makeActivity({
      _id: "a1",
      name: "Chợ Bến Thành",
      time: "09:00",
      order: 1,
      status: "confirmed",
      nearbySuggestions: [{ placeId: "p1", name: "Phở Lệ", distanceKm: 0.4 }],
    } as never),
    makeActivity({
      _id: "a2",
      name: "Bánh Mì Huỳnh Hoa",
      notes: "Lunch",
      time: "12:00",
      order: 2,
    }),
    makeActivity({
      _id: "a3",
      name: "Quán Ốc Oanh",
      notes: "Dinner",
      time: "19:00",
      order: 3,
    }),
    makeActivity({
      _id: "a4",
      name: "Khách sạn Rex",
      type: "accommodation",
      time: "21:00",
      order: 4,
    }),
  ],
} as ItineraryDay;

const INITIAL = useTranslationStore.getState();

beforeEach(() => {
  useTranslationStore.setState({ language: "Vietnamese" });
});
afterEach(() => {
  useTranslationStore.setState(INITIAL, true);
});

describe("trip planner in Vietnamese shows no English source strings", () => {
  it("itinerary day card (day label, count, map link, category, meals, nearby)", () => {
    renderWithProviders(
      <TooltipProvider>
        <DndContext>
          <ItineraryDayCard day={DAY} dayIndex={0} currency="USD" />
        </DndContext>
      </TooltipProvider>,
    );
    // Scan the card only: the DndContext live region is the page's, not the card's.
    expect(leaks(screen.getByTestId("itinerary-day-0"))).toEqual([]);
    expect(screen.getByText("Chợ Bến Thành")).toBeInTheDocument();
    // Meal slot codes from the itinerary builder render as Vietnamese labels.
    expect(screen.getByText("Bữa sáng")).toBeInTheDocument();
    expect(screen.getByText("Bữa trưa")).toBeInTheDocument();
    expect(screen.getByText("Bữa tối")).toBeInTheDocument();
  });

  it("day strip tabs", () => {
    const { container } = renderWithProviders(
      <TripDetailDayStrip
        sortedDays={[DAY, { ...DAY, _id: "day-2", day: 2 }]}
        activeIndex={0}
        onSelectDay={() => {}}
        language="Vietnamese"
      />,
    );
    expect(leaks(container)).toEqual([]);
  });

  it("trip card (duration and budget)", () => {
    const trip = makeTrip({
      title: "Hội An",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-06-04T00:00:00.000Z",
    });
    const { container } = renderWithProviders(<TripCard trip={trip} />);
    expect(leaks(container)).toEqual([]);
  });

  it("summary rail (calendar days, stops & activities)", () => {
    const { container } = renderWithProviders(
      <TripDetailSummaryRail
        tripId="trip-1"
        destination="Hội An"
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
    expect(leaks(container)).toEqual([]);
  });

  it("sidebar free-trip usage", () => {
    renderWithProviders(<DashboardLayout>nội dung</DashboardLayout>, {
      route: "/trips",
    });
    expect(leaks(document.body)).toEqual([]);
  });

  it("dialog close button", () => {
    renderWithProviders(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Tiêu đề</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(leaks(document.body)).toEqual([]);
  });

  it("settings modal auto-load toggle", () => {
    renderWithProviders(<SettingsModal isOpen onClose={() => {}} />);
    expect(leaks(document.body)).toEqual([]);
  });

  it("the guard flags an unresolved translation key (t() returns the raw key)", () => {
    const { container } = renderWithProviders(
      <div>
        <p>{useTranslationStore.getState().t("trip.status.unknown")}</p>
        <p>{` · ${useTranslationStore.getState().t("trips.missingKey")}`}</p>
        <p>Phở Lệ 0.4km</p>
      </div>,
    );
    expect(leaks(container)).toEqual([
      "trip.status.unknown",
      "· trips.missingKey",
    ]);
  });
});
