import { describe, it, expect, afterEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderHookWithQuery } from "@/test/renderHookWithQuery";
import { useSloReport } from "./useSloReport";

const validSli = {
  validEvents: 100,
  goodEvents: 90,
  badEvents: 10,
  sli: 0.9,
  insufficientData: false,
};

const validErrorBudget = {
  target: 0.9,
  budgetTotal: 10,
  budgetConsumed: 10,
  budgetRemaining: 0,
  consumedRatio: 1,
  burnRate: 1,
  exhaustsAt: null,
};

const validLatencyStats = {
  count: 10,
  p50: 1000,
  p95: 2000,
  p99: 3000,
  max: 4000,
};

const validReport = {
  success: true,
  generatedAt: "2026-08-25T00:00:00.000Z",
  windows: {
    compliance: { sli: validSli, errorBudget: validErrorBudget },
    fastBurn: { sli: validSli, errorBudget: validErrorBudget },
    slowBurn: { sli: validSli, errorBudget: validErrorBudget },
  },
  signals: {
    latency: {
      queueWaitMs: validLatencyStats,
      processingMs: validLatencyStats,
      endToEndMs: validLatencyStats,
    },
    traffic: { totalJobs: 100, jobsPerHour: 4.2 },
    errors: { sli: validSli, fallbackRate: 0.05, failureRate: 0.05 },
    saturation: {
      queues: [],
      workerAlive: true,
      lastHeartbeatAt: "2026-08-25T00:00:00.000Z",
      stalledCount: 0,
    },
  },
};

afterEach(() => server.resetHandlers());

describe("useSloReport", () => {
  it("returns the parsed report on success", async () => {
    server.use(
      http.get("*/reliability/slo", () => HttpResponse.json(validReport)),
    );

    const { result } = renderHookWithQuery(() => useSloReport());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.windows.compliance.sli.sli).toBe(0.9);
  });

  it("surfaces an error state instead of throwing when the response fails schema validation", async () => {
    server.use(
      http.get("*/reliability/slo", () =>
        HttpResponse.json({ success: true, generatedAt: "not-a-date" }),
      ),
    );

    const { result } = renderHookWithQuery(() => useSloReport());

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("surfaces an error state on a 403 (non-allowlisted user)", async () => {
    server.use(
      http.get("*/reliability/slo", () =>
        HttpResponse.json({ message: "Forbidden" }, { status: 403 }),
      ),
    );

    const { result } = renderHookWithQuery(() => useSloReport());

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
