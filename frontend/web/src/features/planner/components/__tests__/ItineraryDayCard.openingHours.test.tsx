import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { TooltipProvider } from "@/components/ui/tooltip";
import { renderWithProviders } from "@/test/renderWithProviders";
import { makeActivity } from "@/test/factories/trip";
import {
  useTranslationStore,
  type Language,
} from "@/stores/useTranslationStore";
import type { Activity, ItineraryDay } from "@/utils/schemas";
import { ItineraryDayCard } from "../ItineraryDayCard";

const INITIAL = useTranslationStore.getState();
afterEach(() => useTranslationStore.setState(INITIAL, true));

function renderCard(language: Language, a: Partial<Activity>) {
  useTranslationStore.setState({ language });
  const day = {
    _id: "day-1",
    day: 1,
    date: "2026-06-01T00:00:00.000Z",
    activities: [makeActivity({ _id: "a1", name: "Place", order: 0, ...a })],
  } as ItineraryDay;
  return renderWithProviders(
    <TooltipProvider>
      <DndContext>
        <ItineraryDayCard day={day} dayIndex={0} currency="USD" />
      </DndContext>
    </TooltipProvider>,
  );
}

describe("activity opening hours follow the UI language", () => {
  it("vi: open24h renders Vietnamese, not the provider's English text", () => {
    renderCard("Vietnamese", {
      openingHours: "Open 24 hours",
      openingHoursDetail: { kind: "open24h" },
    } as never);
    expect(screen.getByText("Mở cửa 24 giờ")).toBeInTheDocument();
    expect(screen.queryByText(/open 24 hours/i)).not.toBeInTheDocument();
  });

  it("fr: open24h renders French", () => {
    renderCard("French", {
      openingHours: "Open 24 hours",
      openingHoursDetail: { kind: "open24h" },
    } as never);
    expect(screen.getByText("Ouvert 24h/24")).toBeInTheDocument();
    expect(screen.queryByText(/open 24 hours/i)).not.toBeInTheDocument();
  });

  it("vi and fr: closed day uses the translated label", () => {
    const { unmount } = renderCard("Vietnamese", {
      openingHours: "Closed",
      openingHoursDetail: { kind: "closed" },
    } as never);
    expect(screen.getByText("Đóng cửa")).toBeInTheDocument();
    unmount();
    renderCard("French", {
      openingHours: "Closed",
      openingHoursDetail: { kind: "closed" },
    } as never);
    expect(screen.getByText("Fermé")).toBeInTheDocument();
  });

  it("ranges render as 24h times joined by a comma in every language", () => {
    renderCard("French", {
      openingHours: "8:00 AM – 12:00 PM, 5:00 PM – 10:30 PM",
      openingHoursDetail: {
        kind: "ranges",
        ranges: [
          { open: "08:00", close: "12:00" },
          { open: "17:00", close: "22:30" },
        ],
      },
    } as never);
    expect(
      screen.getByText("08:00 – 12:00, 17:00 – 22:30"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/AM|PM/)).not.toBeInTheDocument();
  });

  it("falls back to the stored text for legacy activities without structured hours", () => {
    renderCard("English (US)", { openingHours: "9:00 AM – 5:00 PM" });
    expect(screen.getByText("9:00 AM – 5:00 PM")).toBeInTheDocument();
  });
});
