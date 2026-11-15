import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { TooltipProvider } from "@/components/ui/tooltip";
import { renderWithProviders } from "@/test/renderWithProviders";
import { makeActivity, makeTrip } from "@/test/factories/trip";
import {
  useTranslationStore,
  type Language,
} from "@/stores/useTranslationStore";
import type { ItineraryDay } from "@/utils/schemas";
import { ItineraryDayCard } from "../ItineraryDayCard";
import { TripCard } from "../TripCard";

const INITIAL = useTranslationStore.getState();
afterEach(() => useTranslationStore.setState(INITIAL, true));

const DAY = {
  _id: "day-1",
  day: 1,
  date: "2026-06-01T00:00:00.000Z",
  activities: [
    makeActivity({
      _id: "a1",
      name: "Chợ Bến Thành",
      order: 0,
      time: "09:00",
      rating: 4,
      priceLevel: 2,
    }),
  ],
} as ItineraryDay;

function renderDay(language: Language) {
  useTranslationStore.setState({ language });
  return renderWithProviders(
    <TooltipProvider>
      <DndContext>
        <ItineraryDayCard day={DAY} dayIndex={0} currency="USD" />
      </DndContext>
    </TooltipProvider>,
  );
}

function renderTripCard(language: Language) {
  useTranslationStore.setState({ language });
  return renderWithProviders(<TripCard trip={makeTrip({ title: "Hội An" })} />);
}

describe("trip card menu button aria-label follows the UI language", () => {
  it.each([
    ["Vietnamese", "Thao tác chuyến đi"],
    ["French", "Actions du voyage"],
    ["English (US)", "Trip actions"],
  ] as const)("%s", (language, name) => {
    renderTripCard(language);
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });
});

describe("itinerary day card aria-labels follow the UI language", () => {
  it("vi: map link, rating and price level are Vietnamese", () => {
    renderDay("Vietnamese");
    expect(
      screen.getByLabelText("Xem Chợ Bến Thành trên Google Maps"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Đánh giá: 4 trên 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Mức giá: 2 trên 4")).toBeInTheDocument();
  });

  it("fr: map link, rating and price level are French", () => {
    renderDay("French");
    expect(
      screen.getByLabelText("Voir Chợ Bến Thành sur Google Maps"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Note : 4 sur 5")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Niveau de prix : 2 sur 4"),
    ).toBeInTheDocument();
  });

  it("en: keeps the English wording", () => {
    renderDay("English (US)");
    expect(
      screen.getByLabelText("View Chợ Bến Thành on Google Maps"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Rating: 4 out of 5")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Price level: 2 out of 4"),
    ).toBeInTheDocument();
  });
});
