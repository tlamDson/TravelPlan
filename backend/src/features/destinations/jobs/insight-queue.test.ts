import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * [Bug fix] `needsUpdate` used to gate on `!city.insightText` — but no
 * writer in the repo ever sets `insightText` (the vector-search RAG path
 * only writes `PlaceInsight` docs + `insightUpdatedAt`; `insightText` is a
 * dead pre-vector field). That made `needsUpdate` permanently true, so
 * `scheduleInsightScraping()` re-queued every supported city on every run
 * regardless of how recently it had actually been scraped — burning Serper
 * + Gemini quota for nothing and defeating the whole point of the 30-day
 * staleness window. Found while seeding the RAG corpus for the eval
 * harness (`.claude/plans/1-rag-eval-eventual-hickey.md`). The correct
 * staleness signal is `insightUpdatedAt` alone, which the worker *does*
 * write (`insight-worker.ts`).
 */

const mockFind = vi.fn();
vi.mock("../models/Country", () => ({
  Country: { find: (...args: unknown[]) => mockFind(...args) },
}));

const mockAdd = vi.fn();
vi.mock("../../../lib/queue", () => ({
  createQueue: vi.fn(() => ({ add: (...args: unknown[]) => mockAdd(...args) })),
}));

describe("scheduleInsightScraping staleness gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT re-queue a city scraped within the last 30 days, even though insightText is null", async () => {
    const recentDate = new Date(); // just scraped
    mockFind.mockResolvedValue([
      {
        idKey: "vn",
        nameEn: "Vietnam",
        cities: [
          {
            idKey: "hanoi",
            nameEn: "Hanoi",
            insightText: null, // never written by any real code path
            insightUpdatedAt: recentDate,
          },
        ],
      },
    ]);

    const { scheduleInsightScraping } = await import("./insight-queue");
    const result = await scheduleInsightScraping();

    expect(result.jobsAdded).toBe(0);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("DOES re-queue a city with no insightUpdatedAt (never scraped)", async () => {
    mockFind.mockResolvedValue([
      {
        idKey: "vn",
        nameEn: "Vietnam",
        cities: [
          {
            idKey: "hanoi",
            nameEn: "Hanoi",
            insightText: null,
            insightUpdatedAt: null,
          },
        ],
      },
    ]);

    const { scheduleInsightScraping } = await import("./insight-queue");
    const result = await scheduleInsightScraping();

    expect(result.jobsAdded).toBe(1);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  it("DOES re-queue a city scraped more than 30 days ago", async () => {
    const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    mockFind.mockResolvedValue([
      {
        idKey: "vn",
        nameEn: "Vietnam",
        cities: [
          {
            idKey: "hanoi",
            nameEn: "Hanoi",
            insightText: null,
            insightUpdatedAt: staleDate,
          },
        ],
      },
    ]);

    const { scheduleInsightScraping } = await import("./insight-queue");
    const result = await scheduleInsightScraping();

    expect(result.jobsAdded).toBe(1);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });
});

describe("enqueueCityScrapes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues exactly the given payloads, with no staleness/DB lookup — used by the one-off eval corpus seed", async () => {
    const { enqueueCityScrapes } = await import("./insight-queue");

    const jobsAdded = await enqueueCityScrapes([
      {
        countryIdKey: "vn",
        countryNameEn: "Vietnam",
        cityIdKey: "hanoi",
        cityNameEn: "Hanoi",
      },
      {
        countryIdKey: "fr",
        countryNameEn: "France",
        cityIdKey: "paris",
        cityNameEn: "Paris",
      },
    ]);

    expect(jobsAdded).toBe(2);
    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("uses the same stable jobId scheme as scheduleInsightScraping (dedupes against the recurring cron)", async () => {
    const { enqueueCityScrapes } = await import("./insight-queue");

    await enqueueCityScrapes([
      {
        countryIdKey: "vn",
        countryNameEn: "Vietnam",
        cityIdKey: "hanoi",
        cityNameEn: "Hanoi",
      },
    ]);

    expect(mockAdd).toHaveBeenCalledWith(
      "scrape-city",
      expect.objectContaining({ countryIdKey: "vn", cityIdKey: "hanoi" }),
      expect.objectContaining({ jobId: "scrape-vn-hanoi" }),
    );
  });

  it("returns 0 for an empty list", async () => {
    const { enqueueCityScrapes } = await import("./insight-queue");
    expect(await enqueueCityScrapes([])).toBe(0);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("retains completed jobs long enough to inspect them (object retention, not `true` which deletes them instantly)", async () => {
    // [BUG] removeOnComplete: true used to delete a completed job the
    // instant it finished — getJobCounts().completed was always ~0, and no
    // event-driven reader could ever see it either, since the job was gone
    // before anything could read it back.
    const { enqueueCityScrapes } = await import("./insight-queue");

    await enqueueCityScrapes([
      {
        countryIdKey: "vn",
        countryNameEn: "Vietnam",
        cityIdKey: "hanoi",
        cityNameEn: "Hanoi",
      },
    ]);

    const [, , options] = mockAdd.mock.calls[0] as [
      unknown,
      unknown,
      { removeOnComplete: unknown; removeOnFail: unknown },
    ];
    expect(options.removeOnComplete).not.toBe(true);
    expect(options.removeOnComplete).toEqual(
      expect.objectContaining({
        age: expect.any(Number),
        count: expect.any(Number),
      }),
    );
  });
});
