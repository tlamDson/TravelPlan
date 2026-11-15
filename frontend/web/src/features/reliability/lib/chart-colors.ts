import { useSyncExternalStore } from "react";

/**
 * Chart color roles for the reliability dashboard. Categorical (series)
 * colors are themed per dataviz's reference palette (slots 1/2/3: blue,
 * orange, aqua); the status palette is fixed — never themed — per the
 * same reference (a status color must stay recognizable regardless of
 * light/dark, since it never carries meaning by hue alone anyway).
 *
 * Mirrors the --reliability-* tokens in index.css (guarded by
 * chart-colors.test.ts) — resolved to literal hsl(...) strings here
 * rather than left as `hsl(var(--x))` because Recharts passes these
 * straight through to SVG fill/stroke attributes, which do resolve CSS
 * custom properties, but only reactively re-render on prop change, not
 * on theme toggle; resolving eagerly via isDark keeps behavior identical
 * to before this token migration.
 */
export interface ChartPalette {
  seriesQueueWait: string;
  seriesProcessing: string;
  seriesEndToEnd: string;
  statusGood: string;
  statusWarning: string;
  statusCritical: string;
  grid: string;
  axis: string;
}

export function resolveChartPalette(isDark: boolean): ChartPalette {
  return {
    seriesQueueWait: isDark ? "hsl(213 77% 56%)" : "hsl(213 68% 50%)",
    seriesProcessing: isDark ? "hsl(17 70% 50%)" : "hsl(17 82% 56%)",
    seriesEndToEnd: isDark ? "hsl(159 73% 36%)" : "hsl(159 73% 40%)",
    statusGood: "hsl(120 86% 34%)",
    statusWarning: "hsl(41 96% 54%)",
    statusCritical: "hsl(0 61% 52%)",
    grid: isDark ? "hsl(60 2% 17%)" : "hsl(53 12% 87%)",
    axis: "hsl(45 3% 52%)",
  };
}

function isDarkModeActive(): boolean {
  return document.documentElement.classList.contains("dark");
}

function subscribeToThemeChanges(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

/**
 * Reactive current-theme chart palette. Reads the `dark` class the app's
 * useThemeStore toggles on <html> (already resolved from "system" there),
 * so this hook doesn't need its own matchMedia listener.
 */
export function useChartColors(): ChartPalette {
  const isDark = useSyncExternalStore(
    subscribeToThemeChanges,
    isDarkModeActive,
    () => false,
  );
  return resolveChartPalette(isDark);
}
