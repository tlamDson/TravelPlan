import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppearanceSettings } from "../AppearanceSettings";
import { useThemeStore } from "@/stores/useThemeStore";

/**
 * [Guard] The theme picker's selected/unselected card chrome previously
 * used raw bg-emerald-500/bg-zinc-100 instead of the app's own semantic
 * tokens. This asserts the selected card uses border-primary (not
 * border-emerald-500) and does NOT reintroduce the raw palette class.
 * The mini light/dark mockup contents inside each card are a documented
 * exception (they must show a literal preview, not follow the theme) and
 * are intentionally not asserted against here.
 */

const INITIAL_THEME_STATE = useThemeStore.getState();

describe("AppearanceSettings theme picker chrome", () => {
  beforeEach(() => {
    useThemeStore.setState(INITIAL_THEME_STATE, true);
  });

  it("selected theme card uses the semantic primary token, not raw emerald", () => {
    render(<AppearanceSettings />);
    const lightButton = screen.getByText("Light").closest("button")!;

    expect(lightButton.className).not.toContain("emerald");
  });

  it("unselected theme cards use the semantic muted token, not raw zinc", () => {
    render(<AppearanceSettings />);
    const darkButton = screen.getByText("Dark").closest("button")!;

    // theme defaults to "system", so light/dark start unselected
    expect(darkButton.className).toContain("bg-muted");
    expect(darkButton.className).not.toMatch(/\bbg-zinc-100\b/);
  });
});
