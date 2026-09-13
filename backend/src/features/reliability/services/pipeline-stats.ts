/**
 * Pure aggregation over harvested BullMQ job snapshots — no I/O, no
 * Mongo/Redis. `measure-pipeline.ts` is the only caller; this file exists
 * separately so the math is unit-testable with hand-computed fixtures
 * (same split as check-services.ts's runner-vs-logic separation).
 */

export interface PipelineJobRecord {
  id: string;
  name: string;
  /** Enqueue time, ms epoch (BullMQ `job.timestamp`). */
  timestamp: number;
  /** ms epoch, or null if the job never started processing. */
  processedOn: number | null;
  /** ms epoch, or null if the job never finished. */
  finishedOn: number | null;
  attemptsMade?: number;
  /** BullMQ's `stc` hash field — number of times this job was moved back to wait for stalling. */
  stalledCounter?: number;
  failedReason?: string | null;
  finishedStatus: "completed" | "failed";
}

function toUtcDateKey(msEpoch: number): string {
  return new Date(msEpoch).toISOString().slice(0, 10);
}

export interface PerDayStats {
  totalJobs: number;
  /** Inclusive span in days between the earliest and latest job timestamp. */
  totalDays: number;
  /** Distinct calendar days (UTC) that had at least one job. */
  daysWithTraffic: number;
  peakPerDay: number;
  /** totalJobs / totalDays — includes zero-traffic days, so it's usually a small, "diluted" number. */
  averagePerDayAll: number;
  /** totalJobs / daysWithTraffic — average only across days that actually saw a job. */
  averagePerDayWithTraffic: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function bucketPerDay(jobs: PipelineJobRecord[]): PerDayStats {
  if (jobs.length === 0) {
    return {
      totalJobs: 0,
      totalDays: 0,
      daysWithTraffic: 0,
      peakPerDay: 0,
      averagePerDayAll: 0,
      averagePerDayWithTraffic: 0,
    };
  }

  const perDayCounts = new Map<string, number>();
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const j of jobs) {
    const key = toUtcDateKey(j.timestamp);
    perDayCounts.set(key, (perDayCounts.get(key) ?? 0) + 1);
    if (j.timestamp < minTs) minTs = j.timestamp;
    if (j.timestamp > maxTs) maxTs = j.timestamp;
  }

  const totalDays = Math.floor((maxTs - minTs) / MS_PER_DAY) + 1; // inclusive span
  const daysWithTraffic = perDayCounts.size;
  const peakPerDay = Math.max(...perDayCounts.values());

  return {
    totalJobs: jobs.length,
    totalDays,
    daysWithTraffic,
    peakPerDay,
    averagePerDayAll: jobs.length / totalDays,
    averagePerDayWithTraffic: jobs.length / daysWithTraffic,
  };
}

export interface LatencyWindows {
  queueWaitMs: number[];
  processingMs: number[];
  endToEndMs: number[];
}

/** Jobs missing processedOn/finishedOn (never started/never finished) are skipped, not zero-filled. */
export function latencyWindows(jobs: PipelineJobRecord[]): LatencyWindows {
  const queueWaitMs: number[] = [];
  const processingMs: number[] = [];
  const endToEndMs: number[] = [];

  for (const j of jobs) {
    if (j.processedOn == null || j.finishedOn == null) continue;
    queueWaitMs.push(j.processedOn - j.timestamp);
    processingMs.push(j.finishedOn - j.processedOn);
    endToEndMs.push(j.finishedOn - j.timestamp);
  }

  return { queueWaitMs, processingMs, endToEndMs };
}

export interface BoundarySplit {
  before: PipelineJobRecord[];
  after: PipelineJobRecord[];
}

/** `before` = timestamp < boundaryMs; `after` = timestamp >= boundaryMs. */
export function splitAtBoundary(
  jobs: PipelineJobRecord[],
  boundaryMs: number,
): BoundarySplit {
  const before: PipelineJobRecord[] = [];
  const after: PipelineJobRecord[] = [];
  for (const j of jobs) {
    (j.timestamp < boundaryMs ? before : after).push(j);
  }
  return { before, after };
}

export interface StallSummary {
  totalJobs: number;
  /** Jobs that stalled at least once, whether or not they eventually completed. */
  stalledJobs: number;
  /** Jobs that failed specifically because they exceeded maxStalledCount. */
  stalledFailures: number;
}

const STALLED_FAILURE_REASON = "job stalled more than allowable limit";

export function stallSummary(jobs: PipelineJobRecord[]): StallSummary {
  let stalledJobs = 0;
  let stalledFailures = 0;

  for (const j of jobs) {
    if ((j.stalledCounter ?? 0) > 0) stalledJobs++;
    if (
      j.finishedStatus === "failed" &&
      (j.failedReason ?? "").includes(STALLED_FAILURE_REASON)
    ) {
      stalledFailures++;
    }
  }

  return { totalJobs: jobs.length, stalledJobs, stalledFailures };
}
