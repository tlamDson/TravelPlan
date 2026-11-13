import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveTripCtaExperiment,
  type ExperimentDefinition,
} from "@travelplan/shared";

const mockInsertDraftIfMissing = vi.fn();
vi.mock("../repositories/experiment.repository", () => ({
  experimentRepository: {
    insertDraftIfMissing: (...a: unknown[]) => mockInsertDraftIfMissing(...a),
  },
}));

import { seedExperimentCatalog } from "./experiment-catalog.service";

const other: ExperimentDefinition = {
  key: "other-v1",
  salt: "o1",
  holdoutBuckets: 0,
  variants: [
    { key: "control", weight: 5000 },
    { key: "treatment", weight: 5000 },
  ],
};

beforeEach(() => {
  mockInsertDraftIfMissing.mockReset();
});

describe("seedExperimentCatalog", () => {
  it("seeds save-trip-cta-v1 by default", async () => {
    mockInsertDraftIfMissing.mockResolvedValue(true);

    const result = await seedExperimentCatalog();

    expect(mockInsertDraftIfMissing).toHaveBeenCalledWith(
      saveTripCtaExperiment,
    );
    expect(result.created).toContain("save-trip-cta-v1");
  });

  it("reports which definitions were created and which already existed", async () => {
    mockInsertDraftIfMissing
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await seedExperimentCatalog([saveTripCtaExperiment, other]);

    expect(result).toEqual({
      created: ["save-trip-cta-v1"],
      existing: ["other-v1"],
    });
  });

  it("rejects an invalid definition before touching the database", async () => {
    const broken = { ...other, holdoutBuckets: 1 };

    await expect(seedExperimentCatalog([other, broken])).rejects.toThrow(
      /other-v1/,
    );
    expect(mockInsertDraftIfMissing).not.toHaveBeenCalled();
  });
});
