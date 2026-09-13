import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripStatusBadge } from "../TripStatusBadge";
import type { TripStatus } from "@/utils/schemas";
import { STATUS_TONE_STYLES, TRIP_STATUS_TONE } from "../../lib/statusStyles";

const ALL_STATUSES: { status: TripStatus; label: string }[] = [
  { status: "DRAFT", label: "Draft" },
  { status: "QUEUED", label: "Queued" },
  { status: "PROCESSING", label: "Processing" },
  { status: "PROCESSING_STEP_1", label: "Processing (Plan)" },
  { status: "PROCESSING_STEP_2", label: "Processing (Verify)" },
  { status: "COMPLETED", label: "Completed" },
  { status: "FAILED", label: "Failed" },
  { status: "FALLBACK", label: "Dự phòng" },
  { status: "CANCELLED", label: "Đã hủy" },
];

describe("TripStatusBadge", () => {
  it.each(ALL_STATUSES)(
    "renders the correct label for $status",
    ({ status, label }) => {
      render(<TripStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it("distinguishes each status by more than color alone (distinct text per status)", () => {
    const labels = ALL_STATUSES.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it.each(ALL_STATUSES)(
    "applies the shared statusStyles pill class for $status, not a hand-rolled one",
    ({ status }) => {
      render(<TripStatusBadge status={status} />);
      const badge = screen.getByTestId("trip-status-badge");
      const expectedClass =
        STATUS_TONE_STYLES[TRIP_STATUS_TONE[status]].pillClassName;

      for (const cls of expectedClass.split(" ")) {
        expect(badge).toHaveClass(cls);
      }
    },
  );
});
