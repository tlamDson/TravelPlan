import { describe, it, expect } from "vitest";
import { generateSyntheticOutcomes } from "./synthetic-seed";

describe("generateSyntheticOutcomes", () => {
  it("matches the requested distribution for n=100 (rounded sensibly)", () => {
    const items = generateSyntheticOutcomes(100, {
      completed: 0.9,
      fallback: 0.05,
      failed: 0.05,
    });
    expect(items).toHaveLength(100);
    expect(items.filter((i) => i.outcome === "completed")).toHaveLength(90);
    expect(items.filter((i) => i.outcome === "fallback")).toHaveLength(5);
    expect(items.filter((i) => i.outcome === "failed")).toHaveLength(5);
  });

  it("returns an empty array for n=0, never throws", () => {
    expect(() => generateSyntheticOutcomes(0)).not.toThrow();
    expect(generateSyntheticOutcomes(0)).toEqual([]);
  });

  it("prefixes every jobId with 'synthetic-' to distinguish fake data from real recordings", () => {
    const items = generateSyntheticOutcomes(5);
    for (const item of items) {
      expect(item.jobId.startsWith("synthetic-")).toBe(true);
    }
  });

  it("endToEndMs always equals queueWaitMs + processingMs", () => {
    const items = generateSyntheticOutcomes(20);
    for (const item of items) {
      expect(item.endToEndMs).toBe(item.queueWaitMs + item.processingMs);
    }
  });

  it("uses the default 90/5/5 distribution when none is given", () => {
    const items = generateSyntheticOutcomes(100);
    expect(items.filter((i) => i.outcome === "completed")).toHaveLength(90);
  });

  it("defaults finishedAt to within the last hour when no spreadMs is given (unchanged behavior)", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const items = generateSyntheticOutcomes(
      10,
      { completed: 1, fallback: 0, failed: 0 },
      now,
    );
    for (const item of items) {
      expect(item.finishedAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(item.finishedAt.getTime()).toBeGreaterThanOrEqual(
        now.getTime() - 60 * 60 * 1000,
      );
    }
  });

  it("spreads finishedAt across the given spreadMs window instead of the hardcoded 1 hour", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const spreadMs = 28 * 24 * 60 * 60 * 1000; // 28 days
    const items = generateSyntheticOutcomes(
      10,
      { completed: 1, fallback: 0, failed: 0 },
      now,
      { spreadMs },
    );
    for (const item of items) {
      expect(item.finishedAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(item.finishedAt.getTime()).toBeGreaterThanOrEqual(
        now.getTime() - spreadMs,
      );
    }
    // With a 28-day spread, at least one sample should land outside the
    // old hardcoded 1h window — proves spreadMs actually took effect
    // rather than silently falling back to the old constant.
    const oneHourAgo = now.getTime() - 60 * 60 * 1000;
    expect(items.some((i) => i.finishedAt.getTime() < oneHourAgo)).toBe(true);
  });

  it("accepts an injectable rand() so output is fully reproducible", () => {
    let calls = 0;
    const sequence = [0.1, 0.9, 0.5, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6, 0.05];
    const rand = () => sequence[calls++ % sequence.length]!;

    const now = new Date("2026-09-01T12:00:00.000Z");
    const runA = generateSyntheticOutcomes(
      10,
      { completed: 0.5, fallback: 0.3, failed: 0.2 },
      now,
      { rand },
    );

    calls = 0;
    const runB = generateSyntheticOutcomes(
      10,
      { completed: 0.5, fallback: 0.3, failed: 0.2 },
      now,
      { rand },
    );

    expect(runA).toEqual(runB);
  });
});
