import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExperimentDefinition } from "@travelplan/shared";

const mockFindRunning = vi.fn();
const mockFindRunningByKey = vi.fn();
vi.mock("../repositories/experiment.repository", () => ({
  experimentRepository: {
    findRunning: (...a: unknown[]) => mockFindRunning(...a),
    findRunningByKey: (...a: unknown[]) => mockFindRunningByKey(...a),
  },
}));

const mockIngestTrusted = vi.fn();
vi.mock("../../analytics/services/analytics-ingest.service", () => ({
  ingestTrustedEvents: (...a: unknown[]) => mockIngestTrusted(...a),
}));

const mockWarn = vi.fn();
vi.mock("../../../lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: (...a: unknown[]) => mockWarn(...a),
  },
}));

vi.mock("../../../config/env", () => ({
  env: { ANALYTICS_HASH_SECRET: "e".repeat(32) },
}));

import { getAssignments, recordExposure } from "./experiments.service";
import { assignVariant } from "./assignment";
import { exposureEventId } from "./exposure-event";

const ab: ExperimentDefinition = {
  key: "vector-ab",
  salt: "s1",
  holdoutBuckets: 0,
  variants: [
    { key: "control", weight: 5000 },
    { key: "treatment", weight: 5000 },
  ],
};
const allHoldout: ExperimentDefinition = {
  key: "all-holdout",
  salt: "h",
  holdoutBuckets: 9998,
  variants: [
    { key: "control", weight: 1 },
    { key: "treatment", weight: 1 },
  ],
};
/** A stored doc that breaks the definition rules (weights sum to 9000). */
const broken = {
  key: "broken-v1",
  salt: "x",
  holdoutBuckets: 0,
  variants: [
    { key: "control", weight: 4500 },
    { key: "treatment", weight: 4500 },
  ],
};
const NOW = new Date("2026-11-13T10:00:00.000Z");

describe("getAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns the user in every running experiment by SHA-256 bucket", async () => {
    mockFindRunning.mockResolvedValue([ab, allHoldout]);
    const result = await getAssignments("user_1");
    expect(result).toEqual([
      { experimentKey: "vector-ab", variant: "treatment" },
      {
        experimentKey: "all-holdout",
        variant: assignVariant(allHoldout, "user_1").variant,
      },
    ]);
    expect(result[1]!.variant).toBe("holdout");
  });

  it("skips (and warns about) a stored experiment that fails the definition schema", async () => {
    mockFindRunning.mockResolvedValue([broken, ab]);
    expect(await getAssignments("user_1")).toEqual([
      { experimentKey: "vector-ab", variant: "treatment" },
    ]);
    expect(mockWarn).toHaveBeenCalledWith(
      { experimentKey: "broken-v1" },
      expect.stringContaining("invalid"),
    );
  });

  it("returns an empty list when nothing is running", async () => {
    mockFindRunning.mockResolvedValue([]);
    expect(await getAssignments("user_1")).toEqual([]);
  });
});

describe("recordExposure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the server-computed variant through the trusted ingest path", async () => {
    mockFindRunningByKey.mockResolvedValue(ab);
    mockIngestTrusted.mockResolvedValue({
      received: 1,
      accepted: 1,
      duplicates: 0,
      quarantined: 0,
    });

    const result = await recordExposure(
      "user_2",
      { experimentKey: "vector-ab", sessionId: "sess-1" },
      NOW,
    );

    expect(mockFindRunningByKey).toHaveBeenCalledWith("vector-ab");
    expect(result).toEqual({
      experimentKey: "vector-ab",
      variant: "control",
      recorded: true,
    });
    expect(mockIngestTrusted).toHaveBeenCalledWith(
      [
        {
          eventId: exposureEventId("vector-ab", "user_2", "sess-1"),
          schemaVersion: 1,
          name: "experiment_exposure",
          occurredAt: NOW.toISOString(),
          sessionId: "sess-1",
          userId: "user_2",
          source: "server",
          properties: {
            experimentKey: "vector-ab",
            variant: "control",
            bucket: 4710,
          },
        },
      ],
      NOW,
    );
  });

  it("reports recorded:false when this session's exposure is already stored", async () => {
    mockFindRunningByKey.mockResolvedValue(ab);
    mockIngestTrusted.mockResolvedValue({
      received: 1,
      accepted: 0,
      duplicates: 1,
      quarantined: 0,
    });
    expect(
      await recordExposure(
        "user_2",
        { experimentKey: "vector-ab", sessionId: "sess-1" },
        NOW,
      ),
    ).toEqual({
      experimentKey: "vector-ab",
      variant: "control",
      recorded: false,
    });
  });

  it("logs holdout exposures too, so holdout vs. treatment stays comparable", async () => {
    mockFindRunningByKey.mockResolvedValue(allHoldout);
    mockIngestTrusted.mockResolvedValue({
      received: 1,
      accepted: 1,
      duplicates: 0,
      quarantined: 0,
    });
    const result = await recordExposure(
      "user_1",
      { experimentKey: "all-holdout", sessionId: "s" },
      NOW,
    );
    expect(result?.variant).toBe("holdout");
    const [[events]] = mockIngestTrusted.mock.calls as [
      [{ properties: { variant: string } }[]],
    ];
    expect(events[0]!.properties.variant).toBe("holdout");
  });

  it("returns null and writes nothing for an unknown or non-running experiment", async () => {
    mockFindRunningByKey.mockResolvedValue(null);
    expect(
      await recordExposure(
        "user_1",
        { experimentKey: "nope", sessionId: "s" },
        NOW,
      ),
    ).toBeNull();
    expect(mockIngestTrusted).not.toHaveBeenCalled();
  });

  it("returns null and writes nothing for a stored experiment that fails the schema", async () => {
    mockFindRunningByKey.mockResolvedValue(broken);
    expect(
      await recordExposure(
        "user_1",
        { experimentKey: "broken-v1", sessionId: "s" },
        NOW,
      ),
    ).toBeNull();
    expect(mockIngestTrusted).not.toHaveBeenCalled();
  });

  it("throws when ingest quarantines the server's own event (a bug, not user input)", async () => {
    mockFindRunningByKey.mockResolvedValue(ab);
    mockIngestTrusted.mockResolvedValue({
      received: 1,
      accepted: 0,
      duplicates: 0,
      quarantined: 1,
    });
    await expect(
      recordExposure(
        "user_1",
        { experimentKey: "vector-ab", sessionId: "s" },
        NOW,
      ),
    ).rejects.toThrow(/quarantined/);
  });
});
