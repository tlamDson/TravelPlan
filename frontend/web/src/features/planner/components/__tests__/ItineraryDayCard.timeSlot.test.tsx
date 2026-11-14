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
import type { ItineraryDay } from "@/utils/schemas";
import { ItineraryDayCard } from "../ItineraryDayCard";

const INITIAL = useTranslationStore.getState();
afterEach(() => useTranslationStore.setState(INITIAL, true));

function renderCard(language: Language) {
  useTranslationStore.setState({ language });
  const day = {
    _id: "day-1",
    day: 1,
    date: "2026-06-01T00:00:00.000Z",
    activities: [
      makeActivity({
        _id: "a1",
        name: "Place",
        order: 0,
        time: "09:30",
        endTime: "11:30",
      }),
    ],
  } as ItineraryDay;
  return renderWithProviders(
    <TooltipProvider>
      <DndContext>
        <ItineraryDayCard day={day} dayIndex={0} currency="USD" />
      </DndContext>
    </TooltipProvider>,
  );
}

describe("activity time slot follows the UI language", () => {
  it("vi: renders the 24-hour clock", () => {
    renderCard("Vietnamese");
    expect(screen.getByText("09:30 – 11:30")).toBeInTheDocument();
    expect(screen.queryByText(/AM|PM/)).not.toBeInTheDocument();
  });

  it("fr: renders the 24-hour clock", () => {
    renderCard("French");
    expect(screen.getByText("09:30 – 11:30")).toBeInTheDocument();
  });

  it("en: keeps AM/PM", () => {
    renderCard("English (US)");
    expect(screen.getByText("9:30 AM – 11:30 AM")).toBeInTheDocument();
  });
});
