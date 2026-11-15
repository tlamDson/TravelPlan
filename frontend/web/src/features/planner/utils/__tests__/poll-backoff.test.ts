import { describe, it, expect } from "vitest";
import {
  getPollDelay,
  POLL_INITIAL_INTERVAL_MS,
  POLL_MAX_INTERVAL_MS,
} from "../poll-backoff";

describe("getPollDelay", () => {
  it("starts at 1s and caps at 5s by default", () => {
    expect(POLL_INITIAL_INTERVAL_MS).toBe(1000);
    expect(POLL_MAX_INTERVAL_MS).toBe(5000);
    expect(getPollDelay(0)).toBe(1000);
    expect(getPollDelay(100)).toBe(5000);
  });

  it("rises monotonically between the initial and max interval", () => {
    const delays = Array.from({ length: 10 }, (_, i) => getPollDelay(i));
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(Math.max(...delays)).toBe(5000);
  });

  it("honours a custom initial and max interval", () => {
    expect(getPollDelay(0, 20, 80)).toBe(20);
    expect(getPollDelay(50, 20, 80)).toBe(80);
  });

  it("keeps a 10-minute generation well under 200 polls", () => {
    let elapsed = 0;
    let polls = 0;
    while (elapsed < 10 * 60 * 1000) {
      elapsed += getPollDelay(polls);
      polls++;
    }
    // At a flat 1s the same generation would cost 600 polls.
    expect(polls).toBeLessThan(130);
  });
});
