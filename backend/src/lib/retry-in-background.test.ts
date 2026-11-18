import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { retryInBackground } from "./retry-in-background";
import { logger } from "./logger";

describe("retryInBackground", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the task once when it succeeds", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    await retryInBackground(task, "t", [10]);
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("resolves after the first failure and retries on the delays", async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockResolvedValueOnce(undefined);
    await retryInBackground(task, "t", [10, 20]);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last delay and logs an error", async () => {
    const task = vi.fn().mockRejectedValue(new Error("down"));
    await retryInBackground(task, "t", [10, 20]);
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
