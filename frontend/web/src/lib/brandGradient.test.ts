import { describe, it, expect } from "vitest";
import {
  BRAND_GRADIENT_BUTTON,
  BRAND_GRADIENT_BADGE,
  BRAND_GRADIENT_WASH,
} from "./brandGradient";

/**
 * [Guard] The purple→orange "Pro" brand gradient was previously duplicated
 * as a raw Tailwind class string across ProBadge, UpgradeModal,
 * DashboardPage and CreateTripDialog. These constants are the single
 * source of truth so Wave 1's billing/upgrade color sweep (re-theming
 * purple/orange into semantic tokens) only needs to change this file.
 */
describe("brandGradient constants", () => {
  it("BRAND_GRADIENT_BUTTON matches the button-strength gradient + hover state", () => {
    expect(BRAND_GRADIENT_BUTTON).toBe(
      "bg-gradient-to-r from-purple-600 to-orange-500 text-white hover:from-purple-700 hover:to-orange-600",
    );
  });

  it("BRAND_GRADIENT_BADGE matches the badge/decoration-strength gradient, no hover", () => {
    expect(BRAND_GRADIENT_BADGE).toBe(
      "bg-gradient-to-r from-purple-500 to-orange-500",
    );
  });

  it("BRAND_GRADIENT_WASH matches the faded background wash", () => {
    expect(BRAND_GRADIENT_WASH).toBe(
      "bg-gradient-to-br from-purple-600/20 via-transparent to-orange-500/20",
    );
  });
});
