import type { Activity } from "@/utils/schemas";

/**
 * Opening-hours text for the UI language. Structured hours (set by the
 * itinerary builder) are rendered with translated labels; activities saved
 * before that fall back to the provider's stored text.
 */
export function formatOpeningHours(
  activity: Pick<Activity, "openingHours" | "openingHoursDetail">,
  t: (key: string) => string,
): string | undefined {
  const detail = activity.openingHoursDetail;
  if (!detail) return activity.openingHours;
  if (detail.kind === "open24h") return t("hours.open24h");
  if (detail.kind === "closed") return t("hours.closed");
  return detail.ranges.map((r) => `${r.open} – ${r.close}`).join(", ");
}
