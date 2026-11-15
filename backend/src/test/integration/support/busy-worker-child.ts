/**
 * Standalone worker process for Track C's "does blocking the event loop
 * actually cause a stall" experiment (see worker-lock-duration.integration.test.ts).
 *
 * Spawned as a genuinely separate OS process — not a `Worker` created
 * in-process — because the failure mode under test is precisely that a
 * synchronous CPU-bound processor blocks the ENTIRE Node event loop of
 * whatever process runs it, including that same process's own lock-renewal
 * timer and stalled-job checker. Trying to observe/drive the check from
 * code living in the same process that's doing the blocking is a
 * contradiction — nothing in that process can run until the block ends.
 * A second, unblocked process (the main test process, see
 * `checkerWorker` there) is what plays the role a second worker replica
 * would play in production.
 *
 * Inherits the parent's env (see `spawnBusyWorkerChild` in the test file),
 * so importing `../../../lib/queue` here is safe — the same envalid vars
 * the integration test process already has are inherited.
 */
import { createWorker } from "../../../lib/queue";

const queueName = process.env.BUSY_QUEUE_NAME;
const lockDuration = Number(process.env.BUSY_LOCK_DURATION_MS);
const blockMs = Number(process.env.BUSY_BLOCK_MS);

if (!queueName || !Number.isFinite(lockDuration) || !Number.isFinite(blockMs)) {
  // eslint-disable-next-line no-console -- stdout/stderr is this child process's only channel back to the parent test
  console.error(
    "busy-worker-child: missing BUSY_QUEUE_NAME/BUSY_LOCK_DURATION_MS/BUSY_BLOCK_MS",
  );
  process.exit(1);
}

/** Synchronous, CPU-bound — deliberately blocks the event loop, unlike `await sleep()`. */
function busySpin(ms: number): void {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // busy-wait on purpose
  }
}

const worker = createWorker(
  queueName,
  async () => {
    busySpin(blockMs);
    return { ok: true };
  },
  {
    concurrency: 1,
    lockDuration,
    // The main test process's `checkerWorker` drives stall detection;
    // this worker's own checker would be blocked by the same busySpin
    // anyway, so it isn't part of what's under test.
    skipStalledCheck: true,
  },
);

worker.on("error", () => {
  // A reclaimed job's original moveToCompleted/moveToFailed call losing
  // the lock race against the main process's checker is expected here,
  // not a crash.
});

// eslint-disable-next-line no-console -- stdout is this child process's only channel back to the parent test
console.log("BUSY_WORKER_READY");
