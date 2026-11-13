/**
 * Structured opening hours. Google's weekdayDescriptions are English text
 * ("Open 24 hours"), so we resolve the structured `periods` into a
 * language-neutral shape the client renders with its own labels.
 */

export interface PeriodPoint {
  /** 0 = Sunday … 6 = Saturday (Google Places v1 / JS getDay) */
  day: number;
  hour: number;
  minute: number;
}

export interface OpeningPeriod {
  open: PeriodPoint;
  close?: PeriodPoint;
}

export interface OpeningHoursRange {
  open: string;
  close: string;
}

export type DayHours =
  | { kind: "open24h" }
  | { kind: "closed" }
  | { kind: "ranges"; ranges: OpeningHoursRange[] };

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (pt: PeriodPoint) => `${pad(pt.hour)}:${pad(pt.minute)}`;

/**
 * @param jsDay 0 = Sunday … 6 = Saturday
 * @returns undefined when periods are unknown (not the same as closed)
 */
export function resolveDayHours(
  periods: OpeningPeriod[] | undefined,
  jsDay: number,
): DayHours | undefined {
  if (!periods || periods.length === 0) return undefined;

  // Google encodes "always open" as one open-only period (Sunday 00:00).
  if (periods.length === 1 && !periods[0]?.close) return { kind: "open24h" };

  const ranges = periods
    .filter((p) => p.open.day === jsDay && p.close)
    .map((p) => ({ open: hhmm(p.open), close: hhmm(p.close!) }))
    .sort((a, b) => a.open.localeCompare(b.open));

  return ranges.length > 0 ? { kind: "ranges", ranges } : { kind: "closed" };
}
