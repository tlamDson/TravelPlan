import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { ErrorBudgetGauge } from "./ErrorBudgetGauge";
import type { ErrorBudget, SliResult } from "@travelplan/shared";
import { STATUS_TONE_STYLES } from "@/features/planner/lib/statusStyles";

const healthySli: SliResult = {
  validEvents: 100,
  goodEvents: 95,
  badEvents: 5,
  sli: 0.95,
  insufficientData: false,
};

const healthyBudget: ErrorBudget = {
  target: 0.9,
  budgetTotal: 10,
  budgetConsumed: 5,
  budgetRemaining: 5,
  consumedRatio: 0.5,
  burnRate: 0.5,
  exhaustsAt: null,
};

describe("ErrorBudgetGauge", () => {
  it("renders 'not enough data' instead of a percentage when insufficientData is true", () => {
    renderWithProviders(
      <ErrorBudgetGauge
        sli={{ ...healthySli, sli: null, insufficientData: true }}
        errorBudget={healthyBudget}
      />,
    );

    expect(screen.getByText(/not enough data/i)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("renders a healthy status when consumedRatio is well under 1", () => {
    renderWithProviders(
      <ErrorBudgetGauge sli={healthySli} errorBudget={healthyBudget} />,
    );

    expect(screen.getByText(/healthy/i)).toBeInTheDocument();
  });

  it("uses the shared success tone for a healthy status, not raw green", () => {
    renderWithProviders(
      <ErrorBudgetGauge sli={healthySli} errorBudget={healthyBudget} />,
    );

    const status = screen.getByText(/healthy/i).parentElement!;
    expect(status.className).toContain(
      STATUS_TONE_STYLES.success.textClassName,
    );
    expect(status.className).not.toMatch(/text-green-600/);
  });

  it("renders an exhausted status (not just a red color) when consumedRatio > 1", () => {
    renderWithProviders(
      <ErrorBudgetGauge
        sli={{ ...healthySli, sli: 0.7, badEvents: 30, goodEvents: 70 }}
        errorBudget={{
          ...healthyBudget,
          consumedRatio: 1.5,
          budgetRemaining: 0,
          burnRate: 1.5,
        }}
      />,
    );

    expect(screen.getByText(/budget exhausted/i)).toBeInTheDocument();
  });

  it("uses the shared danger tone (text-destructive) for a critical status", () => {
    renderWithProviders(
      <ErrorBudgetGauge
        sli={{ ...healthySli, sli: 0.7, badEvents: 30, goodEvents: 70 }}
        errorBudget={{
          ...healthyBudget,
          consumedRatio: 1.5,
          budgetRemaining: 0,
          burnRate: 1.5,
        }}
      />,
    );

    const status = screen.getByText(/budget exhausted/i).parentElement!;
    expect(status.className).toContain(STATUS_TONE_STYLES.danger.textClassName);
  });

  it("renders the exhaustion projection date when provided", () => {
    renderWithProviders(
      <ErrorBudgetGauge
        sli={healthySli}
        errorBudget={{
          ...healthyBudget,
          exhaustsAt: "2026-09-01T00:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByText(/projected exhaustion/i)).toBeInTheDocument();
  });
});
