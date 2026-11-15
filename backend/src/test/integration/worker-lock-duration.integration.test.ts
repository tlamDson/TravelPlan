import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import type { Queue, Worker } from "bullmq";
import { createQueue, createWorker } from "../../lib/queue";

type BusyWorkerChild = ChildProcessByStdio<null, Readable, Readable>;

/**
 * `moveStalledJobsToWait` is marked `private` in bullmq's own .d.ts, but it
 * is a real public instance method at runtime (worker.js does not enforce
 * TS's private) — this narrow structural cast reaches it without an
 * unconstrained `any`. See `checkerWorker` below for why this test drives
 * it directly instead of relying on the Worker's own internal timer.
 */
type StallChecker = { moveStalledJobsToWait(): Promise<string[]> };

/**
 * B3 Track C — what does `lockDuration` actually buy, mechanically?
 *
 * `worker.ts` used to justify `lockDuration: 60_000` with "lock covers
 * long AI/IO jobs". That justification is wrong: lock renewal is a JS
 * timer that fires every `lockDuration/2` regardless of how long a job
 * takes, as long as the event loop stays free — an `await`-based job
 * that takes 10 minutes renews its lock ~1200 times at a 500ms
 * lockDuration and never stalls (scenario 1 below). The only thing
 * `lockDuration` actually buys is how long a job can be stuck on a dead
 * worker before another worker recovers it (scenario 3), and the only
 * way a lock genuinely goes missing while a job is still "active" is a
 * worker that stops running entirely — either it crashes (scenario 3) or
 * its processor synchronously blocks the event loop for longer than the
 * lock's TTL (scenario 2). All three run against real Redis with a real
 * BullMQ Worker — no Gemini/Places calls, no mocked timers.
 */
describe("worker lock duration — mechanism, not statistics", () => {
  const cleanupQueues: Queue[] = [];
  const cleanupWorkers: Worker[] = [];
  const cleanupChildren: BusyWorkerChild[] = [];

  afterEach(async () => {
    for (const child of cleanupChildren.splice(0)) {
      child.kill();
    }
    for (const worker of cleanupWorkers.splice(0)) {
      await worker.close().catch(() => {});
    }
    for (const queue of cleanupQueues.splice(0)) {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close().catch(() => {});
    }
  });

  function uniqueQueueName(label: string): string {
    // integration-setup.ts's afterAll only obliterates QUEUE_NAMES —
    // these scratch queues are cleaned up by this file's own afterEach.
    return `lock-exp-${label}-${randomUUID()}`;
  }

  it("scenario 1 — a non-blocking async job that outlives lockDuration many times over never stalls (lock auto-renews)", async () => {
    const queueName = uniqueQueueName("async-long");
    const queue = createQueue(queueName);
    cleanupQueues.push(queue);

    const lockDuration = 300;
    // 4x lockDuration — comfortably long enough that, if renewal didn't
    // work, this would stall many times over before completing.
    const sleepMs = lockDuration * 4;

    const worker = createWorker(
      queueName,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
        return { ok: true };
      },
      { concurrency: 1, lockDuration, stalledInterval: 200 },
    );
    cleanupWorkers.push(worker);

    const job = await queue.add("job", {});

    const completed = await new Promise<boolean>((resolve) => {
      worker.on("completed", (finishedJob) => {
        if (finishedJob.id === job.id) resolve(true);
      });
    });
    expect(completed).toBe(true);

    const refetched = await queue.getJob(job.id!);
    expect(refetched?.stalledCounter ?? 0).toBe(0);
  }, 10_000);

  it("scenario 2 — a processor that synchronously blocks the event loop past lockDuration+stalledInterval DOES stall, and a second stall fails the job outright", async () => {
    const queueName = uniqueQueueName("busy-block");
    const queue = createQueue(queueName);
    cleanupQueues.push(queue);

    const lockDuration = 500;
    // Long enough that the lock's Redis-side TTL genuinely expires
    // during the block — Redis expires keys server-side on its own
    // clock, unaffected by this test process or the child process being
    // busy.
    const blockMs = lockDuration + 400;

    const child = spawn(
      process.execPath,
      [
        require.resolve("tsx/cli"),
        path.resolve(__dirname, "./support/busy-worker-child.ts"),
      ],
      {
        env: {
          ...process.env,
          BUSY_QUEUE_NAME: queueName,
          BUSY_LOCK_DURATION_MS: String(lockDuration),
          BUSY_BLOCK_MS: String(blockMs),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    cleanupChildren.push(child);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("busy-worker-child did not signal ready")),
        5000,
      );
      child.stdout.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("BUSY_WORKER_READY")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.on("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`busy-worker-child exited early with code ${code}`));
      });
    });

    // Drives stall detection itself, independent of the (busy) child —
    // `autorun: false` means it never calls run(), so it never competes
    // with the child to consume jobs; it only ever calls the public
    // moveStalledJobsToWait() below, exactly what its own internal
    // checker timer would call, just on a schedule this test controls.
    const checkerWorker = createWorker(queueName, async () => {}, {
      autorun: false,
      lockDuration,
      stalledInterval: 100,
      maxStalledCount: 1,
    });
    cleanupWorkers.push(checkerWorker);

    const job = await queue.add(
      "job",
      {},
      { attempts: 5 }, // generous — the deferred-failure path finalizes regardless of attempts left
    );

    async function pollUntil(
      predicate: (
        j: NonNullable<Awaited<ReturnType<Queue["getJob"]>>>,
      ) => boolean,
      timeoutMs: number,
    ) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        await (checkerWorker as unknown as StallChecker)
          .moveStalledJobsToWait()
          .catch(() => []);
        const current = await queue.getJob(job.id!);
        if (current && predicate(current)) return current;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw new Error(`condition not met within ${timeoutMs}ms`);
    }

    // First stall: stc goes from 0 to 1 (not yet over maxStalledCount).
    await pollUntil((j) => (j.stalledCounter ?? 0) >= 1, 8_000);

    // Requeued job gets picked up by the child again (still running,
    // busy-blocks again the same way) → second stall → stc > maxStalledCount
    // → deferred failure is set. The job is only actually finalized as
    // "failed" once something dequeues it again and finds
    // job.deferredFailure — the checker's own moveStalledJobsToWait
    // re-queues it to "wait", and the child (the only real consumer) is
    // what performs that final dequeue-and-fail.
    const failedJob = await pollUntil((j) => j.failedReason != null, 10_000);

    expect(failedJob.stalledCounter ?? 0).toBeGreaterThanOrEqual(2);
    expect(failedJob.failedReason).toContain(
      "job stalled more than allowable limit",
    );
  }, 25_000);

  it("scenario 2b — doubling lockDuration past the block duration avoids the stall entirely", async () => {
    const queueName = uniqueQueueName("busy-block-safe");
    const queue = createQueue(queueName);
    cleanupQueues.push(queue);

    const blockMs = 600;
    const lockDuration = blockMs + 500; // comfortably longer than the block

    const child = spawn(
      process.execPath,
      [
        require.resolve("tsx/cli"),
        path.resolve(__dirname, "./support/busy-worker-child.ts"),
      ],
      {
        env: {
          ...process.env,
          BUSY_QUEUE_NAME: queueName,
          BUSY_LOCK_DURATION_MS: String(lockDuration),
          BUSY_BLOCK_MS: String(blockMs),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    cleanupChildren.push(child);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("busy-worker-child did not signal ready")),
        5000,
      );
      child.stdout.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("BUSY_WORKER_READY")) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    const job = await queue.add("job", {});

    const start = Date.now();
    while (Date.now() - start < 8_000) {
      const current = await queue.getJob(job.id!);
      const state = await current?.getState();
      if (state === "completed") {
        expect(current?.stalledCounter ?? 0).toBe(0);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error("job did not complete within 8000ms");
  }, 15_000);

  it("scenario 3 — a crashed worker's lock recovery time scales with lockDuration (the real, measurable cost of a longer lock)", async () => {
    async function measureRecoveryMs(lockDuration: number): Promise<number> {
      const queueName = uniqueQueueName(`crash-${lockDuration}`);
      const queue = createQueue(queueName);
      cleanupQueues.push(queue);

      let started: () => void;
      const startedPromise = new Promise<void>((resolve) => {
        started = resolve;
      });

      const workerA = createWorker(
        queueName,
        async () => {
          started();
          // Never resolves — simulates a worker that died mid-job; the
          // lock is simply abandoned, not released.
          return new Promise(() => {});
        },
        { concurrency: 1, lockDuration, stalledInterval: 200 },
      );

      await queue.add("job", {});
      await startedPromise;
      const killedAt = Date.now();
      await workerA.close(true); // force-close — no graceful job completion, matches a crash

      const workerB = createWorker(
        queueName,
        async () => ({ recovered: true }),
        { concurrency: 1, lockDuration, stalledInterval: 200 },
      );
      cleanupWorkers.push(workerB);

      await new Promise<void>((resolve) => {
        workerB.on("completed", () => resolve());
      });
      return Date.now() - killedAt;
    }

    const shortLockRecoveryMs = await measureRecoveryMs(500);
    const longLockRecoveryMs = await measureRecoveryMs(2000);

    // Recovery time is bounded below by lockDuration (the job's lock
    // can't even be considered missing before its TTL elapses) plus up
    // to one stalledInterval tick — so a 1500ms larger lockDuration
    // should show up as a comparably large gap, not noise.
    expect(longLockRecoveryMs).toBeGreaterThan(shortLockRecoveryMs);
    expect(longLockRecoveryMs - shortLockRecoveryMs).toBeGreaterThan(800);
  }, 20_000);
});
