import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { TripCard } from "../TripCard";
import { makeTrip } from "@/test/factories/trip";
import { STATUS_TONE_STYLES, TRIP_STATUS_TONE } from "../../lib/statusStyles";

/**
 * [Guard] TripCard previously hand-rolled its own AI_STATUS_COLORS map for
 * the same TripStatus vocabulary TripStatusBadge maps — this asserts it
 * now reads the shared statusStyles overlay-pill class instead, for every
 * status it actually renders a pill for.
 */

const AI_ACTIVE_STATUSES = [
  "DRAFT",
  "QUEUED",
  "PROCESSING",
  "PROCESSING_STEP_1",
  "PROCESSING_STEP_2",
] as const;

describe("TripCard status pill", () => {
  it.each(AI_ACTIVE_STATUSES)(
    "applies the shared statusStyles overlay-pill class for %s",
    (status) => {
      const trip = makeTrip({ status, isAgentProcessing: false });
      renderWithProviders(<TripCard trip={trip} />);

      const pill = screen.getByText(
        status
          .toLowerCase()
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
      );
      const expectedClass =
        STATUS_TONE_STYLES[TRIP_STATUS_TONE[status]].overlayPillClassName;

      for (const cls of expectedClass.split(" ")) {
        expect(pill).toHaveClass(cls);
      }
    },
  );

  it("applies the shared danger overlay-pill class for FAILED", () => {
    const trip = makeTrip({ status: "FAILED", isAgentProcessing: false });
    renderWithProviders(<TripCard trip={trip} />);

    const pill = screen
      .getByTestId(`trip-card-${trip._id}`)
      .querySelector("span")!;
    for (const cls of STATUS_TONE_STYLES.danger.overlayPillClassName.split(
      " ",
    )) {
      expect(pill).toHaveClass(cls);
    }
  });
});
