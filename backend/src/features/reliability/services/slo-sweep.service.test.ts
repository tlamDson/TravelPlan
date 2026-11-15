import { describe, it, expect, vi } from "vitest";
import { sweepSloReadings } from "./slo-sweep.service";
import type { SloSweepReportLike } from "./slo-sweep.service";

function reportOf(
  status: "healthy" | "warning" | "critical" | "insufficient",
): SloSweepReportLike {
  if (status === "insufficient") {
    return {
      windows: {
        compliance: {
          sli: {
            insufficientData: true,
          } as SloSweepReportLike["windows"]["compliance"]["sli"],
          errorBudget: {
            consumedRatio: 0,
          } as SloSweepReportLike["windows"]["compliance"]["errorBudget"],
        },
      },
    };
  }
  const consumedRatio =
    status === "healthy" ? 0.1 : status === "warning" ? 0.6 : 0.95;
  return {
    windows: {
      compliance: {
        sli: {
          insufficientData: false,
        } as SloSweepReportLike["windows"]["compliance"]["sli"],
        errorBudget: {
          consumedRatio,
        } as SloSweepReportLike["windows"]["compliance"]["errorBudget"],
      },
    },
  };
}

describe("sweepSloReadings", () => {
  it("counts every poll between start and end inclusive, spaced by intervalMs", async () => {
    const buildReport = vi.fn().mockResolvedValue(reportOf("healthy"));
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-01-01T00:03:00.000Z");

    const result = await sweepSloReadings({
      start,
      end,
      intervalMs: 60_000,
      buildReport,
    });

    expect(buildReport).toHaveBeenCalledTimes(4);
    expect(result.totalReads).toBe(4);
    expect(result.healthyReads).toBe(4);
    expect(result.insufficientReads).toBe(0);
    expect(result.firstNonHealthyAt).toBeNull();
  });

  it("records the first poll time that reads non-healthy", async () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const buildReport = vi
      .fn()
      .mockResolvedValueOnce(reportOf("healthy"))
      .mockResolvedValueOnce(reportOf("critical"))
      .mockResolvedValueOnce(reportOf("critical"));

    const result = await sweepSloReadings({
      start,
      end: new Date(start.getTime() + 2 * 60_000),
      intervalMs: 60_000,
      buildReport,
    });

    expect(result.firstNonHealthyAt).toEqual(
      new Date(start.getTime() + 60_000),
    );
    expect(result.healthyReads).toBe(1);
  });

  it("counts insufficientData reads separately from healthy — never as healthy", async () => {
    const buildReport = vi
      .fn()
      .mockResolvedValueOnce(reportOf("insufficient"))
      .mockResolvedValueOnce(reportOf("insufficient"));

    const result = await sweepSloReadings({
      start: new Date("2026-01-01T00:00:00.000Z"),
      end: new Date("2026-01-01T00:01:00.000Z"),
      intervalMs: 60_000,
      buildReport,
    });

    expect(result.totalReads).toBe(2);
    expect(result.healthyReads).toBe(0);
    expect(result.insufficientReads).toBe(2);
    // insufficient is non-healthy too, so it trips firstNonHealthyAt
    expect(result.firstNonHealthyAt).toEqual(
      new Date("2026-01-01T00:00:00.000Z"),
    );
  });

  it("passes each poll's Date through to buildReport unchanged", async () => {
    const buildReport = vi.fn().mockResolvedValue(reportOf("healthy"));
    const start = new Date("2026-01-01T00:00:00.000Z");

    await sweepSloReadings({
      start,
      end: start,
      intervalMs: 60_000,
      buildReport,
    });

    expect(buildReport).toHaveBeenCalledWith(start);
  });
});
