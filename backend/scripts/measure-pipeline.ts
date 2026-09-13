/**
 * B3 — measures real trip-generation pipeline throughput/latency/stall
 * rate from BullMQ's own Redis data, and reports it honestly (with
 * confidence bounds, not bare percentages) against the 2026-04-02
 * lockDuration tune.
 *
 * Split into two modes because harvesting needs a live connection to
 * whatever Redis holds the history (often production, reached through a
 * short-lived `railway tcp-proxy`) while reporting is pure offline
 * analysis you'll want to re-run without reopening that connection:
 *
 *   --harvest --redis-url=<url>   Read-only: Queue.getJobs(["completed","failed"])
 *                                  for every queue in QUEUE_NAMES, write a
 *                                  JSON snapshot to disk. NEVER calls
 *                                  .add()/.obliterate()/.clean() — see
 *                                  assertReadOnlyIntent().
 *   --report [--queue=<name>]     Read the snapshot, run pipeline-stats.ts +
 *                                  stall-rate-bounds.ts (pure, unit-tested),
 *                                  print the numbers.
 *
 * Run:
 *   npm run measure:pipeline --workspace=backend -- --harvest --redis-url="redis://..."
 *   npm run measure:pipeline --workspace=backend -- --report
 *   npm run measure:pipeline --workspace=backend -- --report --queue=sync-google-calendar
 */
import fs from "node:fs";
import path from "node:path";
import { Queue, type Job } from "bullmq";
import { buildRedisConnectionOptions } from "../src/lib/redis-options";
import { QUEUE_NAMES } from "../src/lib/queue-defaults";
import {
  bucketPerDay,
  latencyWindows,
  splitAtBoundary,
  stallSummary,
  type PipelineJobRecord,
} from "../src/features/reliability/services/pipeline-stats";
import { computeLatencyStats } from "../src/features/reliability/services/latency-percentiles";
import { describeResolution } from "../src/features/reliability/services/stall-rate-bounds";

const DEFAULT_SNAPSHOT_PATH = path.resolve(
  __dirname,
  "..",
  ".pipeline-snapshot.json",
);

/** The lockDuration tune (60s vs default 30s) went live with this worker deploy. */
const TUNE_BOUNDARY = new Date("2026-04-02T15:20:00.000Z").getTime();

interface Snapshot {
  harvestedAt: string;
  queues: Record<string, PipelineJobRecord[]>;
}

function argValue(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  return arg?.split("=").slice(1).join("=");
}

/**
 * Refuses to run --harvest against something that doesn't look like a
 * deliberately-opened connection. Not a strong guarantee (a proxy URL
 * looks like anything), just a guard against copy-pasting the wrong flag.
 */
function assertReadOnlyIntent(): void {
  if (
    process.argv.includes("--clean") ||
    process.argv.includes("--obliterate") ||
    process.argv.includes("--add")
  ) {
    console.error(
      "measure-pipeline.ts --harvest is read-only by design (Queue.getJobs only). " +
        "Flags that suggest a write operation were passed — refusing to run.",
    );
    process.exit(1);
  }
}

function toRecord(
  job: Job,
  finishedStatus: "completed" | "failed",
): PipelineJobRecord {
  return {
    id: job.id ?? "unknown",
    name: job.name,
    timestamp: job.timestamp,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
    attemptsMade: job.attemptsMade,
    stalledCounter: job.stalledCounter,
    failedReason: job.failedReason ?? null,
    finishedStatus,
  };
}

async function runHarvest(): Promise<void> {
  assertReadOnlyIntent();

  const redisUrl = argValue("--redis-url") ?? process.env.REDIS_URL;
  if (!redisUrl) {
    console.error(
      "Missing --redis-url=<url> (or set REDIS_URL). For production data, open a " +
        "short-lived `railway tcp-proxy` first, then delete it right after this runs — " +
        "see tech-defaults.md's Railway TCP proxy section.",
    );
    process.exit(1);
    return;
  }

  const connection = {
    ...buildRedisConnectionOptions({
      REDIS_URL: redisUrl,
      REDIS_HOST: "",
      REDIS_PORT: 6379,
      REDIS_PASSWORD: "",
      REDIS_TLS: "",
    }),
    maxRetriesPerRequest: null as null,
  };

  const snapshot: Snapshot = {
    harvestedAt: new Date().toISOString(),
    queues: {},
  };

  for (const queueName of Object.values(QUEUE_NAMES)) {
    const queue = new Queue(queueName, { connection });
    try {
      const [completed, failed] = await Promise.all([
        queue.getJobs(["completed"], 0, -1),
        queue.getJobs(["failed"], 0, -1),
      ]);
      const records = [
        ...completed.map((j) => toRecord(j, "completed" as const)),
        ...failed.map((j) => toRecord(j, "failed" as const)),
      ];
      snapshot.queues[queueName] = records;
      console.log(
        `${queueName}: ${completed.length} completed, ${failed.length} failed retained in Redis`,
      );
    } finally {
      await queue.close();
    }
  }

  const outPath = argValue("--out") ?? DEFAULT_SNAPSHOT_PATH;
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nWrote snapshot to ${outPath}`);

  const totalJobs = Object.values(snapshot.queues).reduce(
    (sum, records) => sum + records.length,
    0,
  );
  if (totalJobs === 0) {
    console.log(
      "\n0 job retained across every queue — either this Redis has no history " +
        "for these queues, or retention already evicted it (see DEFAULT_JOB_RETENTION). " +
        "That is itself a real result, not an error.",
    );
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function runReport(): void {
  const snapshotPath = argValue("--snapshot") ?? DEFAULT_SNAPSHOT_PATH;
  if (!fs.existsSync(snapshotPath)) {
    console.error(
      `No snapshot at ${snapshotPath} — run --harvest first (see this file's header comment).`,
    );
    process.exit(1);
    return;
  }

  const snapshot: Snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
  const queueName = argValue("--queue") ?? QUEUE_NAMES.TRIP_GENERATION;
  const jobs = snapshot.queues[queueName] ?? [];

  console.log("=".repeat(70));
  console.log(`Queue: ${queueName}`);
  console.log(`Snapshot harvested at: ${snapshot.harvestedAt}`);
  console.log(
    `Boundary (lockDuration tune): ${new Date(TUNE_BOUNDARY).toISOString()}`,
  );
  console.log(`Jobs retained in Redis for this queue: ${jobs.length}`);
  console.log("=".repeat(70));

  if (jobs.length === 0) {
    console.log(
      "0 jobs — nothing to report. Either retention already evicted history, or " +
        "this queue never had traffic in the harvested Redis instance.",
    );
    return;
  }

  const perDay = bucketPerDay(jobs);
  console.log(
    `\nThroughput  ${perDay.totalJobs} job trong ${perDay.totalDays} ngày = ` +
      `${perDay.averagePerDayAll.toFixed(2)}/ngày (${perDay.daysWithTraffic} ngày có traffic, ` +
      `đỉnh ${perDay.peakPerDay}/ngày, ${perDay.averagePerDayWithTraffic.toFixed(2)}/ngày-có-traffic)`,
  );

  const latency = latencyWindows(jobs);
  const queueWaitStats = computeLatencyStats(latency.queueWaitMs);
  const processingStats = computeLatencyStats(latency.processingMs);
  const endToEndStats = computeLatencyStats(latency.endToEndMs);
  console.log(
    `Latency     queueWait  p50=${formatMs(queueWaitStats.p50)}/p95=${formatMs(queueWaitStats.p95)}/max=${formatMs(queueWaitStats.max)} ; ` +
      `processing p50=${formatMs(processingStats.p50)}/p95=${formatMs(processingStats.p95)}/max=${formatMs(processingStats.max)} ; ` +
      `endToEnd p50=${formatMs(endToEndStats.p50)}/p95=${formatMs(endToEndStats.p95)}/max=${formatMs(endToEndStats.max)}   [n=${endToEndStats.count}]`,
  );
  if (endToEndStats.count < 30) {
    console.log(
      `            ⚠ n=${endToEndStats.count} → p95 là mẫu lớn thứ ${Math.max(1, Math.ceil(0.95 * endToEndStats.count))}, không phải ước lượng phân phối`,
    );
  }

  const { before, after } = splitAtBoundary(jobs, TUNE_BOUNDARY);
  const stallBefore = stallSummary(before);
  const stallAfter = stallSummary(after);
  const resolution = describeResolution(
    stallBefore.totalJobs,
    stallAfter.totalJobs,
  );

  console.log(
    `Stall       trước ${new Date(TUNE_BOUNDARY).toISOString()} : ${stallBefore.stalledJobs}/${stallBefore.totalJobs} job ` +
      `(cận trên 95%: ${resolution.nBeforeUpperBoundPct.toFixed(1)}%)`,
  );
  console.log(
    `            sau                      : ${stallAfter.stalledJobs}/${stallAfter.totalJobs} job ` +
      `(cận trên 95%: ${resolution.nAfterUpperBoundPct.toFixed(1)}%)`,
  );
  console.log(`            → ${resolution.message}`);

  console.log(
    JSON.stringify({
      queue: queueName,
      totalJobs: perDay.totalJobs,
      averagePerDayAll: perDay.averagePerDayAll,
      peakPerDay: perDay.peakPerDay,
      latency: { queueWaitStats, processingStats, endToEndStats },
      stallBefore,
      stallAfter,
      resolvable: resolution.resolvable,
    }),
  );
}

function main(): void {
  if (process.argv.includes("--harvest")) {
    runHarvest()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
    return;
  }

  if (process.argv.includes("--report")) {
    runReport();
    return;
  }

  console.error(
    "Usage: measure-pipeline.ts --harvest --redis-url=<url> | --report [--queue=<name>]",
  );
  process.exit(1);
}

main();
