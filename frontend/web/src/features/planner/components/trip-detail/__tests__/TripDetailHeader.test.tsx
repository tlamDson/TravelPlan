import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/features/experiments", () => ({
  useExperiment: () => ({ variant: null, isLoading: false }),
}));

import { TripDetailHeader } from "../TripDetailHeader";

function renderHeader(title: string) {
  render(
    <TripDetailHeader
      tripTitleLocalized={title}
      isEditingTitle={false}
      editTitleValue=""
      onEditTitleValueChange={vi.fn()}
      onStartEditTitle={vi.fn()}
      onSaveTitle={vi.fn()}
      onCancelEditTitle={vi.fn()}
      onTitleKeyDown={vi.fn()}
      isUpdatingTrip={false}
      actions={null}
    />,
  );
  return screen.getByTestId("trip-detail-title");
}

describe("TripDetailHeader title", () => {
  it("shows the trip name exactly as typed", () => {
    const heading = renderHeader("Release check Kyoto");
    expect(heading).toHaveTextContent(/^Release check Kyoto$/);
  });

  it("does not restyle the name with CSS text-transform (jsdom cannot compute it, so assert on the class)", () => {
    const heading = renderHeader("Release check Kyoto");
    expect(heading).not.toHaveClass("capitalize");
    expect(heading).not.toHaveClass("uppercase");
    expect(heading).not.toHaveClass("lowercase");
  });
});
