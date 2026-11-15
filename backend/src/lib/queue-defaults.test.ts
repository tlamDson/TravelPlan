import { describe, it, expect } from "vitest";
import {
  DEFAULT_JOB_RETENTION,
  QUEUE_NAMES,
  QUEUE_CONCURRENCY,
} from "./queue-defaults";

describe("DEFAULT_JOB_RETENTION", () => {
  it("bounds removeOnComplete by both age and count", () => {
    // Age alone still lets a traffic burst blow up Redis inside the age
    // window; count alone would evict a quiet period's history the moment
    // a burst refills the count. Both bounds together are required.
    expect(DEFAULT_JOB_RETENTION.removeOnComplete).toMatchObject({
      age: expect.any(Number),
      count: expect.any(Number),
    });
  });

  it("bounds removeOnFail by both age and count", () => {
    expect(DEFAULT_JOB_RETENTION.removeOnFail).toMatchObject({
      age: expect.any(Number),
      count: expect.any(Number),
    });
  });

  it("keeps failed jobs around longer than completed jobs (failures need more time to investigate)", () => {
    const completedAge = (
      DEFAULT_JOB_RETENTION.removeOnComplete as { age: number }
    ).age;
    const failedAge = (DEFAULT_JOB_RETENTION.removeOnFail as { age: number })
      .age;
    expect(failedAge).toBeGreaterThan(completedAge);
  });
});

describe("QUEUE_NAMES", () => {
  it("matches the exact strings every createWorker() call listens on", () => {
    // A rename here without updating worker.ts/insight-worker.ts would
    // silently orphan a worker — it would keep listening on the old name
    // while producers enqueue under the new one.
    expect(QUEUE_NAMES.TRIP_GENERATION).toBe("trip-generation");
    expect(QUEUE_NAMES.CALENDAR_SYNC).toBe("sync-google-calendar");
    expect(QUEUE_NAMES.INSIGHT_SCRAPER).toBe("insight-scraper");
  });
});

describe("QUEUE_CONCURRENCY", () => {
  it("has an entry for every queue in QUEUE_NAMES", () => {
    // The single source of truth for concurrency, shared by worker.ts
    // (the createWorker() calls that set it) and
    // queue-saturation.service.ts (utilisation = active/concurrency) —
    // without this, the two could silently drift apart.
    for (const name of Object.values(QUEUE_NAMES)) {
      expect(QUEUE_CONCURRENCY[name]).toBeGreaterThan(0);
    }
  });
});
