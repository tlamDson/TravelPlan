import type { Language } from "@/stores/useTranslationStore";

/** Format one "HH:MM" string: 12-hour AM/PM for English, 24-hour otherwise. */
function formatClock(time: string, language?: Language): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  if (language === "French" || language === "Vietnamese") {
    return `${String(hour).padStart(2, "0")}:${m}`;
  }
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${ampm}`;
}

/** Activity time slot ("09:30 – 11:30") in the clock style of the UI language. */
export function formatTimeRange(
  time?: string,
  endTime?: string,
  language?: Language,
): string {
  if (!time) return "";
  const start = formatClock(time, language);
  return endTime ? `${start} – ${formatClock(endTime, language)}` : start;
}
