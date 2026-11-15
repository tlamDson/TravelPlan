import { z } from "zod";

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

const DAY = 24 * 60;
const WEEK = 7 * DAY;

// Proto3 JSON omits zero-valued fields, so Sunday / midnight arrive as absent keys.
const pointSchema = z.object({
  day: z.number().int().min(0).max(6).default(0),
  hour: z.number().int().min(0).max(24).default(0),
  minute: z.number().int().min(0).max(59).default(0),
});
const periodsSchema = z.array(
  z.object({ open: pointSchema, close: pointSchema.optional() }),
);

/** Validates Google's `periods`; undefined when the payload is malformed. */
export function parseOpeningPeriods(raw: unknown): OpeningPeriod[] | undefined {
  const parsed = periodsSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  return parsed.data.map(({ open, close }) =>
    close ? { open, close } : { open },
  );
}

const minuteOfWeek = (pt: PeriodPoint) =>
  pt.day * DAY + pt.hour * 60 + pt.minute;

/** Week-minute interval of a period; a 23:59 close means end of that day. */
function toInterval(period: OpeningPeriod & { close: PeriodPoint }) {
  const start = minuteOfWeek(period.open);
  let end = minuteOfWeek(period.close);
  if (period.close.hour === 23 && period.close.minute === 59) end += 1;
  if (end <= start) end += WEEK;
  return { start, end };
}

/** True when the union of periods covers the whole of `jsDay`. */
function coversWholeDay(
  periods: (OpeningPeriod & { close: PeriodPoint })[],
  jsDay: number,
): boolean {
  const intervals = periods
    .map(toInterval)
    .flatMap((iv) =>
      [-WEEK, 0, WEEK].map((shift) => ({
        start: iv.start + shift,
        end: iv.end + shift,
      })),
    )
    .sort((a, b) => a.start - b.start);
  let reached = jsDay * DAY;
  const dayEnd = reached + DAY;
  for (const iv of intervals) {
    if (iv.start > reached) break;
    reached = Math.max(reached, iv.end);
    if (reached >= dayEnd) return true;
  }
  return false;
}

/**
 * @param jsDay 0 = Sunday … 6 = Saturday
 * @returns undefined when periods are unknown (not the same as closed)
 */
export function resolveDayHours(
  periods: OpeningPeriod[] | undefined,
  jsDay: number,
): DayHours | undefined {
  if (!periods || periods.length === 0) return undefined;

  // Google encodes "always open" as an open-only period (Sunday 00:00).
  if (periods.some((p) => !p.close)) return { kind: "open24h" };
  const closed = periods as (OpeningPeriod & { close: PeriodPoint })[];

  if (coversWholeDay(closed, jsDay)) return { kind: "open24h" };

  const ranges = closed
    .filter((p) => p.open.day === jsDay)
    .map((p) => ({ open: hhmm(p.open), close: hhmm(p.close) }))
    .sort((a, b) => a.open.localeCompare(b.open));

  return ranges.length > 0 ? { kind: "ranges", ranges } : { kind: "closed" };
}
