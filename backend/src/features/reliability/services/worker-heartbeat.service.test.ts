import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_LIVENESS_TIMEOUT_MS,
} from "@travelplan/shared";

const mockUpsertBeat = vi.fn();
const mockIncrementStalled = vi.fn();
vi.mock("../repositories/worker-heartbeat.repository", () => ({
  workerHeartbeatRepository: {
    upsertBeat: (...args: unknown[]) => mockUpsertBeat(...args),
    incrementStalled: (...args: unknown[]) => mockIncrementStalled(...args),
  },
}));

import {
  isWorkerAlive,
  startHeartbeat,
  recordStall,
} from "./worker-heartbeat.service";

describe("isWorkerAlive", () => {
  it("is true when the last beat is well within the timeout", () => {
    const now = new Date(100_000);
    expect(isWorkerAlive({ lastBeatAt: new Date(99_000) }, now)).toBe(true);
  });

  it("is false at exactly WORKER_LIVENESS_TIMEOUT_MS — the boundary itself counts as dead", () => {
    const now = new Date(100_000);
    const beat = {
      lastBeatAt: new Date(100_000 - WORKER_LIVENESS_TIMEOUT_MS),
    };
    expect(isWorkerAlive(beat, now)).toBe(false);
  });

  it("is true one millisecond under the timeout", () => {
    const now = new Date(100_000);
    const beat = {
      lastBeatAt: new Date(100_000 - WORKER_LIVENESS_TIMEOUT_MS + 1),
    };
    expect(isWorkerAlive(beat, now)).toBe(true);
  });

  it("is false well past the timeout (worker long dead)", () => {
    const now = new Date(1_000_000);
    expect(isWorkerAlive({ lastBeatAt: new Date(0) }, now)).toBe(false);
  });
});

describe("startHeartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockUpsertBeat.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("beats immediately on start — a crash-loop faster than one interval must still leave a heartbeat", async () => {
    startHeartbeat({
      queues: ["trip-generation"],
      concurrency: { "trip-generation": 5 },
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(mockUpsertBeat).toHaveBeenCalledTimes(1);
  });

  it("upserts once per interval after the immediate beat — 1 + 3 after 3 intervals elapse", async () => {
    startHeartbeat({
      queues: ["trip-generation"],
      concurrency: { "trip-generation": 5 },
    });

    await vi.advanceTimersByTimeAsync(WORKER_HEARTBEAT_INTERVAL_MS * 3);
    expect(mockUpsertBeat).toHaveBeenCalledTimes(4);
  });

  it("returns a stop function that clears the interval — no beats after stopping", async () => {
    // Not just "does the test pass" — this guards a real incident shape:
    // an uncleaned interval keeps the worker process alive past SIGTERM,
    // and Railway hard-kills it mid-job instead of a graceful exit.
    const { stop } = startHeartbeat({
      queues: ["trip-generation"],
      concurrency: {},
    });

    await vi.advanceTimersByTimeAsync(WORKER_HEARTBEAT_INTERVAL_MS);
    expect(mockUpsertBeat).toHaveBeenCalledTimes(2); // immediate + 1 interval

    stop();
    await vi.advanceTimersByTimeAsync(WORKER_HEARTBEAT_INTERVAL_MS * 3);
    expect(mockUpsertBeat).toHaveBeenCalledTimes(2); // unchanged — no more calls
  });

  it("a repository rejection on one beat does not stop subsequent beats", async () => {
    mockUpsertBeat.mockRejectedValueOnce(new Error("Mongo hiccup"));
    startHeartbeat({ queues: ["trip-generation"], concurrency: {} });

    // First rejection is the immediate beat; the loop must still be alive
    // for the next 2 interval ticks.
    await vi.advanceTimersByTimeAsync(WORKER_HEARTBEAT_INTERVAL_MS * 2);
    expect(mockUpsertBeat).toHaveBeenCalledTimes(3);
  });

  it("generates a workerId when none is supplied, and reuses a supplied one", () => {
    const { workerId } = startHeartbeat({
      queues: [],
      concurrency: {},
      workerId: "fixed-id",
    });
    expect(workerId).toBe("fixed-id");

    const generated = startHeartbeat({ queues: [], concurrency: {} });
    expect(generated.workerId).toBeTruthy();
    expect(generated.workerId).not.toBe("fixed-id");
  });
});

describe("recordStall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("increments the stalled count for the given workerId", () => {
    mockIncrementStalled.mockResolvedValue(undefined);
    recordStall("worker-1");
    expect(mockIncrementStalled).toHaveBeenCalledWith("worker-1");
  });

  it("does not throw when the repository call rejects (fire-and-forget, logged not propagated)", () => {
    mockIncrementStalled.mockRejectedValue(new Error("Mongo hiccup"));
    expect(() => recordStall("worker-1")).not.toThrow();
  });
});
