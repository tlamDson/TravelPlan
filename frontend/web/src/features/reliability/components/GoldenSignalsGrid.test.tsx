import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { GoldenSignalsGrid } from "./GoldenSignalsGrid";
import type { GoldenSignals } from "@travelplan/shared";
import { STATUS_TONE_STYLES } from "@/features/planner/lib/statusStyles";

const signals: GoldenSignals = {
  latency: {
    queueWaitMs: { count: 10, p50: 100, p95: 200, p99: 300, max: 400 },
    processingMs: { count: 10, p50: 100, p95: 200, p99: 300, max: 400 },
    endToEndMs: { count: 10, p50: 100, p95: 200, p99: 300, max: 400 },
  },
  traffic: { totalJobs: 42, jobsPerHour: 1.75 },
  errors: {
    sli: {
      validEvents: 42,
      goodEvents: 40,
      badEvents: 2,
      sli: 0.95,
      insufficientData: false,
    },
    fallbackRate: 0.02,
    failureRate: null,
  },
  saturation: {
    queues: [],
    workerAlive: true,
    lastHeartbeatAt: "2026-08-25T00:00:00.000Z",
    stalledCount: 0,
  },
};

describe("GoldenSignalsGrid", () => {
  it("renders all 4 golden signal cards with their plain-language definitions", () => {
    renderWithProviders(<GoldenSignalsGrid signals={signals} />);

    expect(screen.getByText(/^latency$/i)).toBeInTheDocument();
    expect(screen.getByText(/^traffic$/i)).toBeInTheDocument();
    expect(screen.getByText(/^errors$/i)).toBeInTheDocument();
    expect(screen.getByText(/^saturation$/i)).toBeInTheDocument();
    expect(screen.getByText(/how long a request takes/i)).toBeInTheDocument();
  });

  it("renders 'N/A' rather than 0% when a rate is null (insufficient data)", () => {
    renderWithProviders(<GoldenSignalsGrid signals={signals} />);

    expect(screen.getByText("N/A")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows worker-down as icon + text, not color alone, when workerAlive is false", () => {
    renderWithProviders(
      <GoldenSignalsGrid
        signals={{
          ...signals,
          saturation: { ...signals.saturation, workerAlive: false },
        }}
      />,
    );

    expect(screen.getByText(/worker down/i)).toBeInTheDocument();
  });

  it("uses the shared success/danger tones for worker alive/down, not raw green", () => {
    const { rerender } = renderWithProviders(
      <GoldenSignalsGrid signals={signals} />,
    );
    const aliveStatus = screen.getByText(/worker alive/i);
    expect(aliveStatus.className).toContain(
      STATUS_TONE_STYLES.success.textClassName,
    );
    expect(aliveStatus.className).not.toMatch(/text-green-600/);

    rerender(
      <GoldenSignalsGrid
        signals={{
          ...signals,
          saturation: { ...signals.saturation, workerAlive: false },
        }}
      />,
    );
    const downStatus = screen.getByText(/worker down/i);
    expect(downStatus.className).toContain(
      STATUS_TONE_STYLES.danger.textClassName,
    );
  });
});
