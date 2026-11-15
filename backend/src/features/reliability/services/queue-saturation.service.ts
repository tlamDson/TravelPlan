import type { Queue } from "bullmq";
import { tripQueue } from "../../planner/trip.queue";
import { calendarSyncQueue } from "../../calendar/calendar.queue";
import { insightQueue } from "../../destinations/jobs/insight-queue";
import { QUEUE_NAMES, QUEUE_CONCURRENCY } from "../../../lib/queue-defaults";
import { workerHeartbeatRepository } from "../repositories/worker-heartbeat.repository";
import { isWorkerAlive } from "./worker-heartbeat.service";
import { logger } from "../../../lib/logger";

/**
 * The Redis/BullMQ half of the saturation golden signal — deliberately a
 * *service*, not a repository, per the layering rule (repositories only
 * touch Mongo). Precedent for a service reaching Redis directly: app.ts's
 * `/ready` and lib/service-checks/redis.check.ts.
 */

const QUEUES: Record<string, Queue> = {
  [QUEUE_NAMES.TRIP_GENERATION]: tripQueue,
  [QUEUE_NAMES.CALENDAR_SYNC]: calendarSyncQueue,
  [QUEUE_NAMES.INSIGHT_SCRAPER]: insightQueue,
};

const COUNT_TYPES = [
  "waiting",
  "active",
  "delayed",
  "failed",
  "paused",
] as const;

export interface QueueSaturation {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  paused: number;
  concurrency: number;
  utilisation: number;
  /** True when getJobCounts() rejected for this queue — partial
   * observability beats none, so the other queues still report. */
  error?: boolean;
}

export interface SaturationSignal {
  queues: QueueSaturation[];
  workerAlive: boolean;
  lastHeartbeatAt: string | null;
  stalledCount: number;
}

async function getOneQueueSaturation(name: string): Promise<QueueSaturation> {
  const concurrency = QUEUE_CONCURRENCY[name] ?? 1;
  try {
    const counts = await QUEUES[name]!.getJobCounts(...COUNT_TYPES);
    const active = counts.active ?? 0;
    return {
      name,
      waiting: counts.waiting ?? 0,
      active,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      paused: counts.paused ?? 0,
      concurrency,
      utilisation: concurrency > 0 ? active / concurrency : 0,
    };
  } catch (err) {
    logger.warn(
      { err, queue: name },
      "Failed to read queue counts for saturation signal",
    );
    return {
      name,
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      paused: 0,
      concurrency,
      utilisation: 0,
      error: true,
    };
  }
}

export async function getSaturationSignal(
  now: Date = new Date(),
): Promise<SaturationSignal> {
  const [queues, heartbeats] = await Promise.all([
    Promise.all(Object.keys(QUEUES).map(getOneQueueSaturation)),
    workerHeartbeatRepository.findAll(),
  ]);

  const workerAlive = heartbeats.some((beat) => isWorkerAlive(beat, now));
  const lastHeartbeatAt = heartbeats.length
    ? heartbeats
        .reduce(
          (latest, b) => (b.lastBeatAt > latest ? b.lastBeatAt : latest),
          heartbeats[0]!.lastBeatAt,
        )
        .toISOString()
    : null;
  const stalledCount = heartbeats.reduce(
    (sum, b) => sum + (b.stalledCount ?? 0),
    0,
  );

  return { queues, workerAlive, lastHeartbeatAt, stalledCount };
}
