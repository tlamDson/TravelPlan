import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/renderWithProviders";
import ReliabilityPage from "./ReliabilityPage";
import type { ReactNode } from "react";

vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const sli = {
  validEvents: 100,
  goodEvents: 90,
  badEvents: 10,
  sli: 0.9,
  insufficientData: false,
};

const errorBudget = {
  target: 0.9,
  budgetTotal: 10,
  budgetConsumed: 10,
  budgetRemaining: 0,
  consumedRatio: 1,
  burnRate: 1,
  exhaustsAt: null,
};

const latencyStats = { count: 10, p50: 1000, p95: 2000, p99: 3000, max: 4000 };

function makeReport(overrides: { compliance?: unknown } = {}) {
  return {
    success: true,
    generatedAt: "2026-08-25T00:00:00.000Z",
    windows: {
      compliance: overrides.compliance ?? { sli, errorBudget },
      fastBurn: { sli, errorBudget },
      slowBurn: { sli, errorBudget },
    },
    signals: {
      latency: {
        queueWaitMs: latencyStats,
        processingMs: latencyStats,
        endToEndMs: latencyStats,
      },
      traffic: { totalJobs: 100, jobsPerHour: 4.2 },
      errors: { sli, fallbackRate: 0.05, failureRate: 0.05 },
      saturation: {
        queues: [],
        workerAlive: true,
        lastHeartbeatAt: null,
        stalledCount: 0,
      },
    },
  };
}

afterEach(() => server.resetHandlers());

describe("ReliabilityPage", () => {
  it("shows insufficientData messaging instead of a fake percentage", async () => {
    server.use(
      http.get("*/reliability/slo", () =>
        HttpResponse.json(
          makeReport({
            compliance: {
              sli: { ...sli, sli: null, insufficientData: true },
              errorBudget,
            },
          }),
        ),
      ),
    );

    renderWithProviders(<ReliabilityPage />);

    await waitFor(() =>
      expect(screen.getByText(/not enough data/i)).toBeInTheDocument(),
    );
  });

  it("shows the exhausted-budget state when consumedRatio > 1", async () => {
    server.use(
      http.get("*/reliability/slo", () =>
        HttpResponse.json(
          makeReport({
            compliance: {
              sli,
              errorBudget: { ...errorBudget, consumedRatio: 1.5 },
            },
          }),
        ),
      ),
    );

    renderWithProviders(<ReliabilityPage />);

    await waitFor(() =>
      expect(screen.getByText(/budget exhausted/i)).toBeInTheDocument(),
    );
  });

  it("renders an error state, not a crash, when the response fails schema validation", async () => {
    server.use(
      http.get("*/reliability/slo", () =>
        HttpResponse.json({ success: true, generatedAt: "not-a-date" }),
      ),
    );

    renderWithProviders(<ReliabilityPage />);

    await waitFor(() =>
      expect(
        screen.getByText(/reliability data unavailable/i),
      ).toBeInTheDocument(),
    );
  });
});
