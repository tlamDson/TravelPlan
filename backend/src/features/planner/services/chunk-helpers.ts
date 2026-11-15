/**
 * Pure day/date-math helpers for itinerary-chunker.service.ts — split out
 * to keep that file under the repo's 200-line limit and make them
 * directly unit-testable.
 */
import type { TripPreferences } from "@travelplan/shared";
import type { IItineraryDay } from "../models/Trip.types";

/**
 * Slice preferences to cover only `chunkDays` days starting from `dayOffset`.
 * We shift startDate forward so the AI generates the correct day numbers.
 */
export function slicePreferences(
  preferences: TripPreferences,
  dayOffset: number,
  chunkDays: number,
): TripPreferences {
  const start = new Date(preferences.startDate);
  start.setDate(start.getDate() + dayOffset);

  const end = new Date(start);
  end.setDate(end.getDate() + chunkDays - 1);

  return {
    ...preferences,
    startDate: start.toISOString().split("T")[0]!,
    endDate: end.toISOString().split("T")[0]!,
  };
}

/**
 * Re-offset day numbers so that chunk Day 1 becomes the correct absolute day
 * within the full trip (e.g. chunk 2, day 1 → trip day 4).
 */
export function rebaseDays(
  days: IItineraryDay[],
  dayOffset: number,
  startDate: Date,
): IItineraryDay[] {
  return days.map((d) => {
    const absDay = d.day + dayOffset;
    const absDate = new Date(startDate);
    absDate.setDate(absDate.getDate() + dayOffset + (d.day - 1));
    return { ...d, day: absDay, date: absDate };
  });
}
