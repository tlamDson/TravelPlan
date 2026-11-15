import { randomUUID } from "crypto";
import os from "os";
import {
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_LIVENESS_TIMEOUT_MS,
} from "@travelplan/shared";
import { workerHeartbeatRepository } from "../repositories/worker-heartbeat.repository";
import { workerLogger as logger } from "../../../lib/logger";

export interface WorkerHeartbeatLike {
  lastBeatAt: Date;
}

/**
 * Pure — no timer, no Date.now() call inside, so liveness can be tested
 * without waiting real time. Inclusive boundary: exactly at the timeout
 * counts as dead, not alive — the last moment a heartbeat is trusted is
 * one millisecond before the timeout.
 */
export function isWorkerAlive(beat: WorkerHeartbeatLike, now: Date): boolean {
  const age = now.getTime() - beat.lastBeatAt.getTime();
  return age < WORKER_LIVENESS_TIMEOUT_MS;
}

export interface StartHeartbeatOptions {
  queues: string[];
  concurrency: Record<string, number>;
  /** Overridable for tests; defaults to a fresh UUID per process start. */
  workerId?: string;
  host?: string;
  intervalMs?: number;
}

export interface HeartbeatHandle {
  workerId: string;
  stop: () => void;
}

/**
 * Starts the recurring liveness upsert, firing once immediately and then
 * every `intervalMs`. The immediate beat matters more than it looks: a
 * crash-loop faster than one interval (e.g. a worker OOM-killed within
 * 15s of boot) would otherwise never write a single heartbeat — exactly
 * the scenario this feature exists to catch would be invisible. Every
 * beat is try/caught and logged at `warn` — a Mongo hiccup must not
 * crash the worker process or stop future beats.
 */
export function startHeartbeat(
  options: StartHeartbeatOptions,
): HeartbeatHandle {
  const workerId = options.workerId ?? randomUUID();
  const host = options.host ?? os.hostname();
  const startedAt = new Date();
  const intervalMs = options.intervalMs ?? WORKER_HEARTBEAT_INTERVAL_MS;

  const beat = async () => {
    try {
      await workerHeartbeatRepository.upsertBeat({
        workerId,
        host,
        queues: options.queues,
        concurrency: options.concurrency,
        startedAt,
        lastBeatAt: new Date(),
      });
    } catch (err) {
      logger.warn({ err, workerId }, "Failed to upsert worker heartbeat");
    }
  };

  void beat();
  const timer = setInterval(() => void beat(), intervalMs);

  return {
    workerId,
    stop: () => clearInterval(timer),
  };
}

/**
 * Fire-and-forget stall counter for a worker's `stalled` event — never
 * awaited by the caller (BullMQ's `stalled` handler isn't async-aware in
 * the same way `completed`/`failed` are), so failures are caught and
 * logged here rather than becoming an unhandled rejection.
 */
export function recordStall(workerId: string): void {
  workerHeartbeatRepository.incrementStalled(workerId).catch((err) => {
    logger.warn({ err, workerId }, "Failed to record worker stall");
  });
}
