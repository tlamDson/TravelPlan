import { describe, it, expect } from "vitest";
import {
  DAY_COLORS,
  DAY_COLORS_LIGHT,
  getDayColor,
  getDayColorLight,
  withAlpha,
} from "./dayColors";
import { readCssVar } from "@/test/cssVarFixture";

/**
 * [Guard] DAY_COLORS/DAY_COLORS_LIGHT must mirror the --day-N/--day-N-light
 * tokens in index.css exactly, not duplicate hex numbers with no source of
 * truth. Map marker colors are intentionally NOT re-themed between light
 * and dark (map markers render over literal map tile imagery, not app
 * chrome — same rationale as chart-colors.ts's fixed status palette), so
 * :root and .dark must declare identical values for every --day-* var.
 */

describe("[Guard] DAY_COLORS mirrors --day-* tokens in index.css", () => {
  it("has 9 entries, one per available tag hue", () => {
    expect(DAY_COLORS.length).toBe(9);
    expect(DAY_COLORS_LIGHT.length).toBe(9);
  });

  it("each DAY_COLORS entry equals hsl(var --day-N) resolved from index.css, unchanged between :root and .dark", () => {
    DAY_COLORS.forEach((color, i) => {
      const dayNumber = i + 1;
      const rootValue = readCssVar("root", `day-${dayNumber}`);
      const darkValue = readCssVar("dark", `day-${dayNumber}`);

      expect(darkValue).toBe(rootValue);
      expect(color).toBe(`hsl(${rootValue})`);
    });
  });

  it("each DAY_COLORS_LIGHT entry equals hsl(var --day-N-light) resolved from index.css, unchanged between :root and .dark", () => {
    DAY_COLORS_LIGHT.forEach((color, i) => {
      const dayNumber = i + 1;
      const rootValue = readCssVar("root", `day-${dayNumber}-light`);
      const darkValue = readCssVar("dark", `day-${dayNumber}-light`);

      expect(darkValue).toBe(rootValue);
      expect(color).toBe(`hsl(${rootValue})`);
    });
  });

  it("getDayColor/getDayColorLight loop through the palette past day 9", () => {
    expect(getDayColor(10)).toBe(DAY_COLORS[0]);
    expect(getDayColorLight(10)).toBe(DAY_COLORS_LIGHT[0]);
  });
});

describe("withAlpha", () => {
  it("inserts an alpha channel into an hsl(...) color", () => {
    expect(withAlpha("hsl(239 84% 67%)", 0.33)).toBe("hsl(239 84% 67% / 0.33)");
  });

  it("throws on a non-hsl input instead of silently producing invalid CSS", () => {
    expect(() => withAlpha("#6366f1", 0.33)).toThrow(
      /expected an "hsl\(\.\.\.\)" string/,
    );
  });
});
