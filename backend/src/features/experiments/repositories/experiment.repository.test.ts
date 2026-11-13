import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveTripCtaExperiment } from "@travelplan/shared";

const mockUpdateOne = vi.fn();
vi.mock("../models/Experiment", () => ({
  default: { updateOne: (...a: unknown[]) => mockUpdateOne(...a) },
}));

import { ExperimentRepository } from "./experiment.repository";

const repo = new ExperimentRepository();

beforeEach(() => {
  mockUpdateOne.mockReset();
});

describe("ExperimentRepository.insertDraftIfMissing", () => {
  it("upserts by key and writes fields only on insert, as draft", async () => {
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });

    await repo.insertDraftIfMissing(saveTripCtaExperiment);

    expect(mockUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = mockUpdateOne.mock.calls[0] ?? [];
    expect(filter).toEqual({ key: "save-trip-cta-v1" });
    // Only $setOnInsert: an existing doc (e.g. one already running) is
    // never modified — no $set, no status change.
    expect(Object.keys(update)).toEqual(["$setOnInsert"]);
    expect(update.$setOnInsert).toEqual({
      ...saveTripCtaExperiment,
      status: "draft",
    });
    expect(options).toEqual({ upsert: true });
  });

  it("returns true when the doc was inserted", async () => {
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1, matchedCount: 0 });
    await expect(
      repo.insertDraftIfMissing(saveTripCtaExperiment),
    ).resolves.toBe(true);
  });

  it("returns false when a doc with the key already existed", async () => {
    mockUpdateOne.mockResolvedValue({ upsertedCount: 0, matchedCount: 1 });
    await expect(
      repo.insertDraftIfMissing(saveTripCtaExperiment),
    ).resolves.toBe(false);
  });
});
