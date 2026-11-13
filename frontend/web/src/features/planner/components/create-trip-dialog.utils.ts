import type { TripWizardData } from "@/stores/trip-wizard.store";
import type { TripPreferences } from "@travelplan/shared";

export const MAX_TRIP_DAYS = 90;

export function getTripDays(
  startDate: string | Date,
  endDate: string | Date,
) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 1 || diffDays > MAX_TRIP_DAYS) return null;
  return diffDays;
}

const PACE_TO_ACTIVITIES: Record<string, number> = {
  relaxed: 2,
  balanced: 4,
  packed: 6,
};

export function buildPreferences(data: TripWizardData) {
  const preferences: TripPreferences = {
    destination: data.destination.trim(),
    startDate: new Date(data.startDate).toISOString(),
    endDate: new Date(data.endDate).toISOString(),
    budget: {
      total: data.budget.total,
      currency: data.budget.currency,
    },
    travelers: {
      adults: data.travelers.adults,
      children: data.travelers.children,
    },
    accommodationType:
      data.accommodationType === "" || !data.accommodationType
        ? "any"
        : data.accommodationType,
    priorities: data.priorities,
    mood: data.mood || undefined,
    interests: data.interests.length > 0 ? data.interests : undefined,
    dealBreakers: data.dealBreakers.length > 0 ? data.dealBreakers : undefined,
    purpose: data.purpose,
    groupType: data.groupType,
    transportMode: data.transportMode,
    // New Step 5 fields
    pace: data.pace,
    focus: data.focus,
    constraints: data.constraints,
    specialRequirements: data.specialRequirements || undefined,
    includedMeals: data.includedMeals,
    activitiesPerDay: PACE_TO_ACTIVITIES[data.pace] ?? 3,
    // RAG lookup idKeys — only set when user selected from dropdown
    countryIdKey: data.countryIdKey,
    cityIdKey: data.cityIdKey,
  };

  return preferences;
}
