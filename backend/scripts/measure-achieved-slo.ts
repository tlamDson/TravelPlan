/**
 * Read-only: reports the SLI/error-budget the trip-generation pipeline
 * has ACTUALLY achieved, from real JobMetric documents — never a
 * synthetic/simulated number. Complements measure-false-healthy.ts,
 * which answers "would the dashboard notice an outage"; this answers
 * "what does the dashboard currently say, and is that number honest".
 *
 * Every number printed here is produced by the real production code
 * path (buildSloReport / computeSli / computeErrorBudget / the
 * jobMetricRepository aggregations) — this script never re-implements
 * the math, only reads and formats it.
 *
 * Run (after `npm run seed:real-trip-jobs` has generated real traffic):
 *   npm run measure:achieved-slo --workspace=backend
 *   npm run measure:achieved-slo --workspace=backend -- --sinceMinutes=120 --pollSeconds=60
 */
import * as dotenv from "dotenv";
import mongoose from "mongoose";
import {
  MIN_EVENTS_FOR_SLI,
  SLO_LATENCY_THRESHOLD_MS,
} from "@travelplan/shared";
import type { LatencyStats } from "@travelplan/shared";
import { QUEUE_NAMES } from "../src/lib/queue-defaults";
import { jobMetricRepository } from "../src/features/reliability/repositories/job-metric.repository";
import { buildSloReport } from "../src/features/reliability/services/slo-report.service";
import { sweepSloReadings } from "../src/features/reliability/services/slo-sweep.service";
import { classifyReading } from "../src/features/reliability/services/incident-timeline";

dotenv.config();

const DAY_MS = 24 * 60 * 60 * 1000;

function parseNumberArg(flag: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  const value = arg ? Number(arg.split("=")[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${minutes}m`;
}

function formatLatency(label: string, stats: LatencyStats): string {
  return `    ${label.padEnd(12)} p50=${stats.p50}ms p95=${stats.p95}ms p99=${stats.p99}ms max=${stats.max}ms (n=${stats.count})`;
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
    return;
  }

  const queue = QUEUE_NAMES.TRIP_GENERATION;
  const sinceMinutes = parseNumberArg("--sinceMinutes", 90);
  const pollIntervalMs = parseNumberArg("--pollSeconds", 60) * 1000;
  const now = new Date();
  const loadRunStart = new Date(now.getTime() - sinceMinutes * 60_000);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const host = new URL(
    uri.replace("mongodb+srv://", "https://").replace("mongodb://", "http://"),
  ).host;
  console.log(
    `Connected to Mongo (${host}) — READ-ONLY, no writes will be made.\n`,
  );

  // Q1/Q2 — the real production report, unmodified. Its compliance window
  // is SLO_WINDOW_DAYS (28d), so a recent load run sits fully inside it;
  // no re-derivation of the math happens here.
  const report = await buildSloReport({ queue, now });
  const compliance = report.windows.compliance;
  const status = classifyReading(compliance.sli, compliance.errorBudget);

  // Breakdown of WHY the SLI is what it is — same compliance window
  // buildSloReport used internally (SLO_WINDOW_DAYS back from `now`).
  const complianceSince = new Date(now.getTime() - 28 * DAY_MS);
  const [rawCounts, failureBreakdown, slowCompletedCount] = await Promise.all([
    jobMetricRepository.countByOutcome(queue, complianceSince, now),
    jobMetricRepository.countByFailureReason(queue, complianceSince, now),
    jobMetricRepository.countSlowCompleted(
      queue,
      complianceSince,
      now,
      SLO_LATENCY_THRESHOLD_MS,
    ),
  ]);

  // Q3-equivalent for this measurement: sweep the load-run window itself
  // with the real dashboard poll cadence to see when/if it left healthy.
  const sweep = await sweepSloReadings({
    start: loadRunStart,
    end: now,
    intervalMs: pollIntervalMs,
    buildReport: (pollTime) => buildSloReport({ queue, now: pollTime }),
  });

  await mongoose.disconnect();

  console.log("=".repeat(60));
  console.log("Q1  SLI đạt được (compliance window, 28 ngày):");
  if (compliance.sli.insufficientData) {
    console.log(
      `    insufficientData=true — chỉ có ${compliance.sli.validEvents} event hợp lệ, ` +
        `cần tối thiểu ${MIN_EVENTS_FOR_SLI} để tin một con số SLI.`,
    );
  } else {
    console.log(
      `    sli=${(compliance.sli.sli! * 100).toFixed(2)}% ` +
        `(goodEvents=${compliance.sli.goodEvents}, badEvents=${compliance.sli.badEvents}, ` +
        `validEvents=${compliance.sli.validEvents})`,
    );
  }
  console.log(
    `    raw outcome counts    : completed=${rawCounts.completed} fallback=${rawCounts.fallback} failed=${rawCounts.failed}`,
  );
  console.log(
    `    completed nhưng vượt ${SLO_LATENCY_THRESHOLD_MS / 1000}s (tính là bad event): ${slowCompletedCount}`,
  );
  console.log(
    `    breakdown lý do fail/fallback: ${
      Object.keys(failureBreakdown).length > 0
        ? JSON.stringify(failureBreakdown)
        : "(không có job non-completed nào trong window)"
    }`,
  );

  console.log("\nQ2  Error budget đã tiêu:");
  console.log(
    `    consumedRatio=${(compliance.errorBudget.consumedRatio * 100).toFixed(1)}% ` +
      `(budgetConsumed=${compliance.errorBudget.budgetConsumed.toFixed(2)}, ` +
      `budgetRemaining=${compliance.errorBudget.budgetRemaining.toFixed(2)} / total=${compliance.errorBudget.budgetTotal.toFixed(2)})`,
  );
  console.log(`    burnRate=${compliance.errorBudget.burnRate.toFixed(2)}x`);
  console.log(`    trạng thái dashboard: ${status}`);

  console.log("\nQ3  Coverage của lớp đo trên chính load run vừa chạy:");
  console.log(
    `    cửa sổ quét           : ${loadRunStart.toISOString()} → ${now.toISOString()} (${formatDuration(now.getTime() - loadRunStart.getTime())})`,
  );
  console.log(
    `    số lần poll           : ${sweep.totalReads} (mỗi ${pollIntervalMs / 1000}s)`,
  );
  console.log(`    lần đọc healthy       : ${sweep.healthyReads}`);
  console.log(`    lần đọc insufficient  : ${sweep.insufficientReads}`);
  console.log(
    sweep.firstNonHealthyAt
      ? `    rời healthy lần đầu tại: ${sweep.firstNonHealthyAt.toISOString()} (+${formatDuration(
          sweep.firstNonHealthyAt.getTime() - loadRunStart.getTime(),
        )} từ đầu cửa sổ quét)`
      : `    KHÔNG rời healthy trong suốt cửa sổ quét ở trên`,
  );

  console.log("\nLatency (compliance window):");
  console.log(formatLatency("queueWait", report.signals.latency.queueWaitMs));
  console.log(formatLatency("processing", report.signals.latency.processingMs));
  console.log(formatLatency("endToEnd", report.signals.latency.endToEndMs));
  console.log("=".repeat(60));

  console.log(
    JSON.stringify({
      queue,
      generatedAt: report.generatedAt,
      sli: compliance.sli,
      errorBudget: compliance.errorBudget,
      status,
      failureBreakdown,
      slowCompletedCount,
      latency: report.signals.latency,
      loadRunSweep: {
        start: loadRunStart.toISOString(),
        end: now.toISOString(),
        ...sweep,
      },
    }),
  );
}

main()
  .then(() => {
    // buildSloReport()'s saturation signal touches the real BullMQ queue
    // objects, which hold open ioredis sockets — mongoose.disconnect()
    // alone never lets this CLI script exit on its own.
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
