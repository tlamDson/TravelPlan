import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubscriptionSettings } from "../SubscriptionSettings";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";

/**
 * [Guard] The "Pro" checkmarks and the over-quota usage bar previously
 * used raw text-emerald-500/bg-red-100 instead of the shared
 * statusStyles tones (success/danger) already established for status
 * coloring. The indigo->purple "Pro plan" gradient is a deliberately
 * separate design choice from the brand purple->orange gradient (PR3)
 * and is NOT touched by this migration.
 */

const INITIAL_SUBSCRIPTION_STATE = useSubscriptionStore.getState();

describe("SubscriptionSettings status colors", () => {
  beforeEach(() => {
    useSubscriptionStore.setState(INITIAL_SUBSCRIPTION_STATE, true);
  });

  it("Pro plan checkmarks use the shared success tone, not raw emerald", () => {
    useSubscriptionStore.setState({ isPro: true });
    render(<SubscriptionSettings />);

    const label = screen.getByText("Generate up to 30 days per trip");
    const checkmark = label.previousElementSibling as SVGElement;

    expect(checkmark.tagName.toLowerCase()).toBe("svg");
    expect(checkmark.getAttribute("class")).toContain("text-green-500");
    expect(checkmark.getAttribute("class")).not.toContain("emerald");
  });

  it("over-quota usage bar uses the shared tag-red token, not raw red-100", () => {
    useSubscriptionStore.setState({
      isPro: false,
      tripsUsedThisCycle: 10,
      tripLimit: 10,
    });
    render(<SubscriptionSettings />);

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar.className).toContain("bg-tag-red");
    expect(progressbar.className).not.toMatch(/\bbg-red-100\b/);
  });
});
