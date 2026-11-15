import type { SliResult, ErrorBudget } from "@travelplan/shared";
import { classifyReading } from "./incident-timeline";

/**
 * Extracted from the inline sweep loop in
 * backend/scripts/measure-false-healthy.ts (--simulate mode) so the loop
 * itself is unit-testable without Mongo — the caller injects
 * `buildReport`, which in production is a thin wrapper around the real
 * buildSloReport({ now }) and in tests is a fake returning canned
 * readings. Only the two fields classifyReading() needs are required, so
 * a fake doesn't have to fabricate a full SloReportResponse.
 */

export type SloSweepReportLike = {
  windows: {
    compliance: {
      sli: Pick<SliResult, "insufficientData">;
      errorBudget: Pick<ErrorBudget, "consumedRatio">;
    };
  };
};

export interface SloSweepParams {
  start: Date;
  end: Date;
  intervalMs: number;
  buildReport: (pollTime: Date) => Promise<SloSweepReportLike>;
}

export interface SloSweepResult {
  totalReads: number;
  healthyReads: number;
  insufficientReads: number;
  firstNonHealthyAt: Date | null;
}

export async function sweepSloReadings(
  params: SloSweepParams,
): Promise<SloSweepResult> {
  let totalReads = 0;
  let healthyReads = 0;
  let insufficientReads = 0;
  let firstNonHealthyAt: Date | null = null;

  for (
    let t = params.start.getTime();
    t <= params.end.getTime();
    t += params.intervalMs
  ) {
    const pollTime = new Date(t);
    const report = await params.buildReport(pollTime);
    const status = classifyReading(
      report.windows.compliance.sli,
      report.windows.compliance.errorBudget,
    );

    totalReads++;
    if (status === "healthy") healthyReads++;
    if (status === "insufficient") insufficientReads++;
    if (status !== "healthy" && firstNonHealthyAt === null) {
      firstNonHealthyAt = pollTime;
    }
  }

  return { totalReads, healthyReads, insufficientReads, firstNonHealthyAt };
}
