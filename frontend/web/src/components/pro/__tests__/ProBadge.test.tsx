import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProBadge } from "../ProBadge";

/**
 * [Guard] ProBadge's border previously used raw border-purple-300/70,
 * duplicated (with a different shade/opacity) in UpgradeModal.tsx. Both
 * now reuse the --tag-purple-text token exposed in PR #66.
 */
describe("ProBadge", () => {
  it("uses the shared tag-purple-text token for its border, not raw purple", () => {
    render(<ProBadge />);
    const badge = screen.getByText("PRO");

    expect(badge.className).toContain("border-tag-purple-text/70");
    expect(badge.className).not.toMatch(/\bborder-purple-\d/);
  });
});
