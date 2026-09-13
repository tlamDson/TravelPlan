import { describe, it, expect } from "vitest";
import { resolveChartPalette } from "./chart-colors";
import { readCssVar } from "@/test/cssVarFixture";

/**
 * [Guard] resolveChartPalette must mirror the --reliability-* tokens in
 * index.css, not duplicate hex numbers with no source of truth. Series
 * colors are themed (different light/dark values); status/grid/axis
 * roles that are fixed on purpose still resolve to a single token value
 * that is identical between :root and .dark.
 */

function expectHsl(actual: string, mode: "root" | "dark", varName: string) {
  expect(actual).toBe(`hsl(${readCssVar(mode, varName)})`);
}

describe("resolveChartPalette mirrors --reliability-* tokens in index.css", () => {
  it("returns the light-mode categorical + status hexes when isDark is false", () => {
    const palette = resolveChartPalette(false);

    expectHsl(palette.seriesQueueWait, "root", "reliability-series-queue-wait");
    expectHsl(
      palette.seriesProcessing,
      "root",
      "reliability-series-processing",
    );
    expectHsl(palette.seriesEndToEnd, "root", "reliability-series-end-to-end");
    expectHsl(palette.statusGood, "root", "reliability-status-good");
    expectHsl(palette.statusWarning, "root", "reliability-status-warning");
    expectHsl(palette.statusCritical, "root", "reliability-status-critical");
    expectHsl(palette.grid, "root", "reliability-grid");
    expectHsl(palette.axis, "root", "reliability-axis");
  });

  it("returns the dark-mode categorical hexes when isDark is true, status hexes unchanged", () => {
    const palette = resolveChartPalette(true);

    expectHsl(palette.seriesQueueWait, "dark", "reliability-series-queue-wait");
    expectHsl(
      palette.seriesProcessing,
      "dark",
      "reliability-series-processing",
    );
    expectHsl(palette.seriesEndToEnd, "dark", "reliability-series-end-to-end");
    // Status/axis palette is fixed — never themed (dataviz reference palette
    // rule). The token itself carries the same value in :root and .dark.
    expectHsl(palette.statusGood, "root", "reliability-status-good");
    expectHsl(palette.statusWarning, "root", "reliability-status-warning");
    expectHsl(palette.statusCritical, "root", "reliability-status-critical");
    expectHsl(palette.grid, "dark", "reliability-grid");
    expectHsl(palette.axis, "root", "reliability-axis");
  });

  it("keeps status/axis tokens identical between :root and .dark (fixed-palette contract)", () => {
    for (const name of [
      "reliability-status-good",
      "reliability-status-warning",
      "reliability-status-critical",
      "reliability-axis",
    ]) {
      expect(readCssVar("dark", name)).toBe(readCssVar("root", name));
    }
  });
});
