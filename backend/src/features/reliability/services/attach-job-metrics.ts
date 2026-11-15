import type { Worker } from "bullmq";
import { workerLogger as logger } from "../../../lib/logger";
import { toJobMetricInput, isTerminalFailure } from "./job-outcome";
import type { JobLike } from "./job-outcome";
import { jobMetricRepository } from "../repositories/job-metric.repository";

/**
 * Wires a BullMQ Worker's own `completed`/`failed` events to the
 * reliability recorder. Every handler is wrapped in try/catch and logs at
 * `warn` rather than propagating — the measurement layer must never fail
 * the thing it measures. A Mongo hiccup here must not turn a successful
 * trip into a job the caller sees an exception from.
 */
export function attachJobMetrics(worker: Worker, queue: string): void {
  worker.on("completed", async (job) => {
    try {
      const input = toJobMetricInput({
        queue,
        job: job as unknown as JobLike,
        now: new Date(),
      });
      await jobMetricRepository.record(input);
    } catch (err) {
      logger.warn(
        { err, jobId: job.id, queue },
        "Failed to record job metric for a completed job",
      );
    }
  });

  worker.on("failed", async (job, err) => {
    if (!job) return;
    // Not terminal yet — BullMQ fires `failed` on every attempt, not just
    // the last one. Recording here would count a job that ultimately
    // succeeds after a transient error as (mostly) bad.
    if (!isTerminalFailure(job)) return;

    try {
      const input = toJobMetricInput({
        queue,
        job: job as unknown as JobLike,
        error: err,
        now: new Date(),
      });
      await jobMetricRepository.record(input);
    } catch (recordErr) {
      logger.warn(
        { err: recordErr, jobId: job.id, queue },
        "Failed to record job metric for a terminally-failed job",
      );
    }
  });

  // Saturation signal — stalledCount is written by Phase 5's worker
  // heartbeat; this handler just logs for now so stalls are at least
  // visible in structured logs before that lands.
  worker.on("stalled", (jobId) => {
    logger.warn({ jobId, queue }, "Job stalled");
  });

  worker.on("error", (err) => {
    logger.warn({ err, queue }, "Worker error event");
  });
}
