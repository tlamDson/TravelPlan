/**
 * Answers 3 questions about the false-healthy failure mode (BullMQ
 * reports `completed` while a static fallback silently replaced a real
 * AI-generated trip — the real gemini-2.0-flash outage, fixed in commit
 * f62baef on 2026-08-15):
 *
 *   Q1  How many jobs get falsely reported as healthy?
 *   Q2  How long was the dashboard wrong before detection?
 *   Q3  What % of "healthy" dashboard reads were fake?
 *
 * Two independent modes:
 *
 *   --simulate       Builds a synthetic incident timeline (background
 *                     traffic + a 100%-fallback window), writes it
 *                     through jobMetricRepository under a scratch queue
 *                     name, then sweeps buildSloReport({ now }) — the
 *                     REAL production SLO math, not a re-implementation
 *                     — across simulated 60s polls (the real dashboard's
 *                     poll interval) to find when a poll first stops
 *                     reading healthy. Refuses to run against anything
 *                     that isn't localhost, same guard as
 *                     seed-job-metrics.ts.
 *
 *   --retrospective  Read-only aggregation over the real Trip collection
 *                     to measure the actual gemini-2.0-flash incident
 *                     window on production data. Never writes.
 *
 * Run:
 *   npm run measure:false-healthy --workspace=backend -- --simulate
 *   npm run measure:false-healthy --workspace=backend -- --retrospective
 */
import * as dotenv from "dotenv";
import mongoose from "mongoose";
import {
  buildIncidentTimeline,
  classifyReading,
} from "../src/features/reliability/services/incident-timeline";
import { jobMetricRepository } from "../src/features/reliability/repositories/job-metric.repository";
import { tripStatusRetrospectiveRepository } from "../src/features/reliability/repositories/trip-status-retrospective.repository";
import { buildSloReport } from "../src/features/reliability/services/slo-report.service";

dotenv.config();

const SIMULATION_QUEUE = "measure-false-healthy-sim";
const GEMINI_FIX_DATE = new Date("2026-08-15T00:00:00.000Z"); // commit f62baef

function assertLocalMongoUri(uri: string): void {
  if (!/localhost|127\.0\.0\.1/.test(uri)) {
    console.error(
      "Refusing to run --simulate — MONGO_URI does not look like localhost/dev. " +
        "This mode WRITES scratch JobMetric documents and must never run " +
        "against staging/production. Use --retrospective for real data " +
        "(it never writes).",
    );
    process.exit(1);
  }
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${minutes}m`;
}

function parseNumberArg(flag: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  const value = arg ? Number(arg.split("=")[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function runSimulation(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
    return;
  }
  assertLocalMongoUri(uri);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  console.log("Connected to Mongo (localhost) — writing scratch data.\n");

  // Each simulated poll runs the real buildSloReport() (3 Mongo window
  // aggregations + latency samples + a live BullMQ/Redis saturation
  // check) — not free. Defaults keep a full run under ~30s; override with
  // --incidentHours=/--pollSeconds= for a longer or finer sweep.
  const backgroundWindowMs = 28 * 24 * 60 * 60 * 1000; // SLO_WINDOW_DAYS
  const backgroundRatePerHour = 2;
  const incidentHours = parseNumberArg("--incidentHours", 6);
  const incidentDurationMs = incidentHours * 60 * 60 * 1000;
  const pollIntervalMs = parseNumberArg("--pollSeconds", 60) * 1000;
  const now = new Date();
  const incidentStart = new Date(now.getTime() - incidentDurationMs);

  console.log("Assumptions:");
  console.log(
    `  background traffic   : ${backgroundRatePerHour} jobs/hour over 28 days`,
  );
  console.log(
    `  incident window      : ${formatDuration(incidentDurationMs)}, 100% fallback`,
  );
  console.log(
    `  poll interval        : ${pollIntervalMs / 1000}s (default matches useSloReport.ts's 60s)`,
  );
  console.log(
    `  dashboard renders    : compliance window only (ReliabilityPage.tsx does not show fastBurn/slowBurn)\n`,
  );

  const timeline = buildIncidentTimeline({
    now,
    backgroundWindowMs,
    backgroundRatePerHour,
    incidentStart,
    incidentDurationMs,
  });

  for (const item of timeline) {
    await jobMetricRepository.record({
      queue: SIMULATION_QUEUE,
      jobName: "generate-trip",
      jobId: item.jobId,
      outcome: item.outcome,
      attemptsMade: item.attemptsMade,
      queueWaitMs: item.queueWaitMs,
      processingMs: item.processingMs,
      endToEndMs: item.endToEndMs,
      finishedAt: item.finishedAt,
    });
  }
  console.log(
    `Wrote ${timeline.length} scratch JobMetric documents (queue="${SIMULATION_QUEUE}").\n`,
  );

  const incidentJobCount = timeline.filter((i) =>
    i.jobId.startsWith("synthetic-incident-"),
  ).length;

  let firstNonHealthyAt: Date | null = null;
  let healthyReads = 0;
  let insufficientReads = 0;
  let totalReads = 0;

  for (
    let t = incidentStart.getTime();
    t <= incidentStart.getTime() + incidentDurationMs;
    t += pollIntervalMs
  ) {
    const pollTime = new Date(t);
    const report = await buildSloReport({
      queue: SIMULATION_QUEUE,
      now: pollTime,
    });
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

  await mongoose.disconnect();

  console.log("=".repeat(60));
  console.log(
    `Q1  ${incidentJobCount}/${incidentJobCount} incident-window jobs báo sai (100%)`,
  );
  console.log(`    — mỗi job này BullMQ đều báo "completed" (fallback path`);
  console.log(`    trả { success: true, status: "FALLBACK" } chứ không throw)`);
  console.log(
    `Q2  Bull Board       : không bao giờ tự phát hiện (không đọc job.returnvalue.status)`,
  );
  console.log(
    firstNonHealthyAt
      ? `    /reliability (mô phỏng) : lần poll đầu rời healthy tại +${formatDuration(
          firstNonHealthyAt.getTime() - incidentStart.getTime(),
        )} (${totalReads} lần poll trong cửa sổ sự cố)`
      : `    /reliability (mô phỏng) : KHÔNG rời healthy trong suốt cửa sổ sự cố — tín hiệu vẫn mù`,
  );
  console.log(
    `Q3  ${healthyReads}/${totalReads} lần đọc healthy là giả (${((healthyReads / totalReads) * 100).toFixed(1)}%), thêm ${insufficientReads} lần đọc "insufficient data"`,
  );
  console.log("=".repeat(60));
  console.log(
    JSON.stringify({
      mode: "simulate",
      incidentJobCount,
      totalReads,
      healthyReads,
      insufficientReads,
      falseHealthyRatio: healthyReads / totalReads,
      firstNonHealthyAtMsFromIncidentStart: firstNonHealthyAt
        ? firstNonHealthyAt.getTime() - incidentStart.getTime()
        : null,
    }),
  );
}

async function runRetrospective(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
    return;
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const host = new URL(
    uri.replace("mongodb+srv://", "https://").replace("mongodb://", "http://"),
  ).host;
  console.log(
    `Connected to Mongo (${host}) — READ-ONLY, no writes will be made.\n`,
  );

  const since = new Date("2026-02-02T00:00:00.000Z"); // repo's initial commit
  const until = new Date(GEMINI_FIX_DATE.getTime() + 24 * 60 * 60 * 1000);

  const rows = await tripStatusRetrospectiveRepository.countByStatusPerDay(
    since,
    until,
  );
  await mongoose.disconnect();

  const fallbackDays = rows.filter(
    (r) => r.status === "FALLBACK" && r.count > 0,
  );
  const totalFallback = fallbackDays.reduce((sum, r) => sum + r.count, 0);
  const totalFailed = rows
    .filter((r) => r.status === "FAILED")
    .reduce((sum, r) => sum + r.count, 0);
  const firstFallbackDay =
    fallbackDays.length > 0 ? fallbackDays[0]!.date : null;

  const incidentDays = firstFallbackDay
    ? Math.round(
        (GEMINI_FIX_DATE.getTime() -
          new Date(`${firstFallbackDay}T00:00:00.000Z`).getTime()) /
          (24 * 60 * 60 * 1000),
      )
    : null;

  console.log("=".repeat(60));
  console.log(
    `Q1  ${totalFallback} trip FALLBACK thật trong khoảng ${since.toISOString().slice(0, 10)}..${until.toISOString().slice(0, 10)}`,
  );
  console.log(
    `    (mỗi trip này BullMQ đã báo "completed" — không phải giả thuyết)`,
  );
  console.log(`Q2  Bull Board       : không bao giờ tự phát hiện`);
  console.log(
    firstFallbackDay
      ? `    Sự cố thật (Trip.status) : FALLBACK đầu tiên ${firstFallbackDay} → fix f62baef ${GEMINI_FIX_DATE.toISOString().slice(0, 10)} = ${incidentDays} ngày`
      : `    Không tìm thấy trip FALLBACK nào trong khoảng đã quét — mở rộng --since nếu cần`,
  );
  console.log(
    `Q3  Tỷ lệ FALLBACK/(FALLBACK+FAILED) = ${
      totalFallback + totalFailed > 0
        ? ((totalFallback / (totalFallback + totalFailed)) * 100).toFixed(1)
        : "n/a"
    }% — phần trăm lần AI-generation thất bại mà dashboard/BullMQ vẫn báo completed thay vì failed`,
  );
  console.log("=".repeat(60));
  console.log(
    JSON.stringify({
      mode: "retrospective",
      totalFallback,
      totalFailed,
      firstFallbackDay,
      fixDate: GEMINI_FIX_DATE.toISOString().slice(0, 10),
      incidentDays,
    }),
  );
}

async function main() {
  const mode = process.argv.includes("--retrospective")
    ? "retrospective"
    : process.argv.includes("--simulate")
      ? "simulate"
      : null;

  if (!mode) {
    console.error(
      "Usage: measure-false-healthy.ts --simulate | --retrospective",
    );
    process.exit(1);
    return;
  }

  if (mode === "simulate") {
    await runSimulation();
  } else {
    await runRetrospective();
  }
}

main()
  .then(() => {
    // buildSloReport()'s saturation signal touches the real
    // tripQueue/calendarSyncQueue/insightQueue BullMQ objects, which hold
    // open ioredis sockets for the life of the process — mongoose.disconnect()
    // alone never lets this CLI script exit on its own.
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
