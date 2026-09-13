/**
 * Palette of 9 distinct colors for itinerary day groups.
 * Each day number maps to a consistent color used for
 * Mapbox markers, lines, and the legend.
 *
 * Mirrors the --day-1..9 / --day-1-light..9-light tokens in index.css
 * (guarded by dayColors.test.ts) — resolved to literal hsl(...) strings
 * here rather than left as `hsl(var(--day-1))` because Mapbox GL paint
 * properties (e.g. line-color) evaluate outside the browser CSS engine
 * and do not support CSS custom properties.
 */

export const DAY_COLORS = [
  "hsl(239 84% 67%)", // Day 1 — Indigo
  "hsl(142 71% 45%)", // Day 2 — Green
  "hsl(38 92% 50%)", // Day 3 — Amber
  "hsl(0 84% 60%)", // Day 4 — Red
  "hsl(217 91% 60%)", // Day 5 — Blue
  "hsl(330 81% 60%)", // Day 6 — Pink
  "hsl(173 80% 40%)", // Day 7 — Teal
  "hsl(25 95% 53%)", // Day 8 — Orange
  "hsl(258 90% 66%)", // Day 9 — Violet
] as const;

/** Light (bg) version of each color for UI chips and panels */
export const DAY_COLORS_LIGHT = [
  "hsl(226 100% 94%)", // Day 1
  "hsl(141 84% 93%)", // Day 2
  "hsl(48 96% 89%)", // Day 3
  "hsl(0 93% 94%)", // Day 4
  "hsl(214 95% 93%)", // Day 5
  "hsl(326 78% 95%)", // Day 6
  "hsl(167 85% 89%)", // Day 7
  "hsl(34 100% 92%)", // Day 8
  "hsl(251 91% 95%)", // Day 9
] as const;

/**
 * Returns a color for the given 1-based day number.
 * Loops through the palette if trip has > 9 days.
 */
export function getDayColor(dayNumber: number): string {
  const index = (dayNumber - 1) % DAY_COLORS.length;
  return DAY_COLORS[index];
}

/** Light (bg) version of each color for UI chips and panels */
export function getDayColorLight(dayNumber: number): string {
  const index = (dayNumber - 1) % DAY_COLORS.length;
  return DAY_COLORS_LIGHT[index];
}

/**
 * Returns a DAY_COLORS/DAY_COLORS_LIGHT entry with the given alpha applied,
 * e.g. withAlpha("hsl(239 84% 67%)", 0.33) -> "hsl(239 84% 67% / 0.33)".
 * Replaces the old `${hexColor}55` string-concat trick, which assumed a
 * 6-digit hex string and silently produced invalid CSS once colors moved
 * to hsl(...) format.
 */
export function withAlpha(color: string, alpha: number): string {
  const match = color.match(/^hsl\(([^)]+)\)$/);
  if (!match) {
    throw new Error(`withAlpha: expected an "hsl(...)" string, got "${color}"`);
  }
  return `hsl(${match[1]} / ${alpha})`;
}
