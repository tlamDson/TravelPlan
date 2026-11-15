import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseExperiment = vi.fn();
vi.mock("@/features/experiments", () => ({
  useExperiment: (...a: unknown[]) => mockUseExperiment(...a),
}));

import { SaveTripCta } from "../SaveTripCta";

function renderCta(props: Partial<Parameters<typeof SaveTripCta>[0]> = {}) {
  const onSave = vi.fn();
  render(<SaveTripCta onSave={onSave} disabled={false} {...props} />);
  return { onSave };
}

beforeEach(() => {
  mockUseExperiment.mockReset();
  mockUseExperiment.mockReturnValue({ variant: null, isLoading: false });
});

describe("SaveTripCta", () => {
  it("reads the save-trip-cta-v1 variant and exposes it when it renders", () => {
    renderCta();
    expect(mockUseExperiment).toHaveBeenCalledWith("save-trip-cta-v1");
  });

  it.each([
    ["no assignment", null],
    ["control", "control"],
    ["holdout", "holdout"],
    ["an unknown variant", "something-else"],
  ])("renders the icon-only button for %s", (_label, variant) => {
    mockUseExperiment.mockReturnValue({ variant, isLoading: false });
    renderCta();

    const button = screen.getByRole("button", { name: "Save trip name" });
    expect(button).toHaveAttribute("data-variant", "control");
    expect(button).not.toHaveTextContent("Save trip");
  });

  it("renders a labeled Save trip button for labeled-cta", () => {
    mockUseExperiment.mockReturnValue({
      variant: "labeled-cta",
      isLoading: false,
    });
    renderCta();

    const button = screen.getByRole("button", { name: "Save trip" });
    expect(button).toHaveAttribute("data-variant", "labeled-cta");
    expect(button).toHaveTextContent("Save trip");
  });

  it.each([null, "labeled-cta"])(
    "calls onSave when clicked (variant %s)",
    async (variant) => {
      mockUseExperiment.mockReturnValue({ variant, isLoading: false });
      const { onSave } = renderCta();

      await userEvent.click(screen.getByRole("button", { name: /^Save trip/ }));

      expect(onSave).toHaveBeenCalledTimes(1);
    },
  );

  it("is disabled while the trip is saving", () => {
    mockUseExperiment.mockReturnValue({
      variant: "labeled-cta",
      isLoading: false,
    });
    renderCta({ disabled: true });

    expect(screen.getByRole("button", { name: "Save trip" })).toBeDisabled();
  });
});
