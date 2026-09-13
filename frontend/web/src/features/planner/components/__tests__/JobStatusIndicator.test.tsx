import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobStatusIndicator, JobStatusBadge } from "../JobStatusIndicator";
import type { JobStatus } from "@/utils/schemas";
import { STATUS_TONE_STYLES, JOB_STATUS_TONE } from "../../lib/statusStyles";

const ALL_STATUSES: { status: JobStatus; label: string }[] = [
  { status: "IDLE", label: "Ready" },
  { status: "QUEUED", label: "In queue..." },
  { status: "PROCESSING", label: "Processing..." },
  { status: "COMPLETED", label: "Completed" },
  { status: "FAILED", label: "Failed" },
  { status: "CANCELLED", label: "Cancelled" },
];

describe("JobStatusIndicator", () => {
  it.each(ALL_STATUSES)(
    "renders the correct label for $status",
    ({ status, label }) => {
      render(<JobStatusIndicator status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it.each(["PROCESSING", "QUEUED"] as const)(
    "shows the progress bar for %s",
    (status) => {
      render(<JobStatusIndicator status={status} progress={50} />);
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    },
  );

  it.each(["IDLE", "COMPLETED", "FAILED", "CANCELLED"] as const)(
    "hides the progress bar for %s",
    (status) => {
      render(<JobStatusIndicator status={status} />);
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    },
  );

  it("shows currentStep only when status is PROCESSING", () => {
    const { rerender } = render(
      <JobStatusIndicator
        status="PROCESSING"
        currentStep="Validating places..."
      />,
    );
    expect(screen.getByText("Validating places...")).toBeInTheDocument();

    rerender(
      <JobStatusIndicator status="QUEUED" currentStep="Validating places..." />,
    );
    expect(screen.queryByText("Validating places...")).not.toBeInTheDocument();
  });

  it("respects showProgress=false", () => {
    render(
      <JobStatusIndicator
        status="PROCESSING"
        progress={50}
        showProgress={false}
      />,
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it.each(ALL_STATUSES)(
    "applies the shared statusStyles text class for $status, not a hand-rolled one",
    ({ status }) => {
      render(<JobStatusIndicator status={status} />);
      const label = screen.getByText(
        ALL_STATUSES.find((s) => s.status === status)!.label,
      );
      const expectedClass =
        STATUS_TONE_STYLES[JOB_STATUS_TONE[status]].textClassName;

      expect(label).toHaveClass(expectedClass);
    },
  );

  it("resolves QUEUED and PROCESSING to different tones (the divergence this PR fixes)", () => {
    expect(JOB_STATUS_TONE.QUEUED).not.toBe(JOB_STATUS_TONE.PROCESSING);
  });
});

describe("JobStatusBadge", () => {
  it("shows currentStep in place of the label when provided", () => {
    render(
      <JobStatusBadge
        status="PROCESSING"
        currentStep="Building itinerary..."
      />,
    );
    expect(screen.getByText("Building itinerary...")).toBeInTheDocument();
    expect(screen.queryByText("Processing...")).not.toBeInTheDocument();
  });

  it("falls back to the status label when currentStep is absent", () => {
    render(<JobStatusBadge status="COMPLETED" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it.each(ALL_STATUSES)(
    "applies the shared statusStyles pill class for $status, not a hand-rolled one",
    ({ status }) => {
      render(<JobStatusBadge status={status} />);
      const badge = screen.getByTestId("job-status-badge");
      const expectedClass =
        STATUS_TONE_STYLES[JOB_STATUS_TONE[status]].pillClassName;

      for (const cls of expectedClass.split(" ")) {
        expect(badge).toHaveClass(cls);
      }
    },
  );
});
