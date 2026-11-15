import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpgradeModal } from "../UpgradeModal";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { apiClient } from "@/lib/axios";

vi.mock("@/lib/axios", () => ({
  apiClient: { post: vi.fn() },
}));

/**
 * [Guard] UpgradeModal previously used raw white/purple/red palette
 * classes (bg-white/15, text-purple-500, border-red-300, etc.) instead
 * of theme-aware tokens. bg-white/15 in particular rendered a
 * translucent WHITE overlay even in dark mode — a real dark-mode bug,
 * not just a token-hygiene nit. All now reuse tokens from PR #66/#70.
 */

const INITIAL_SUBSCRIPTION_STATE = useSubscriptionStore.getState();

describe("UpgradeModal color tokens", () => {
  beforeEach(() => {
    useSubscriptionStore.setState(INITIAL_SUBSCRIPTION_STATE, true);
    useSubscriptionStore.setState({ isUpgradeModalOpen: true });
  });

  it("uses the theme-aware card token for its background, not raw white", () => {
    render(<UpgradeModal />);
    const dialog = screen.getByRole("dialog");

    expect(dialog.className).toContain("bg-card/15");
    expect(dialog.className).not.toMatch(/\bbg-white\/15\b/);
  });

  it("uses the shared tag-purple-text token for the Sparkles icon, not raw purple", () => {
    render(<UpgradeModal />);
    const icon = screen
      .getByText("Upgrade to TravelPlan Pro")
      .querySelector("svg")!;

    expect(icon.getAttribute("class")).toContain("text-tag-purple-text");
    expect(icon.getAttribute("class")).not.toMatch(/text-purple-\d/);
  });

  it("uses the shared tag-red tokens for the error message, not raw red", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<UpgradeModal />);

    await user.click(screen.getByRole("button", { name: /upgrade now/i }));

    const errorMessage = await screen.findByText(/could not connect/i);
    expect(errorMessage.className).toContain("bg-tag-red");
    expect(errorMessage.className).toContain("text-tag-red-text");
    expect(errorMessage.className).not.toMatch(/\bbg-red-50\b/);
    expect(errorMessage.className).not.toMatch(/\btext-red-600\b/);
  });
});
