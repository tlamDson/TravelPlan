import { describe, it, expect, beforeAll } from "vitest";
import {
  saveTripCtaExperiment,
  type ExperimentDefinition,
} from "@travelplan/shared";
import Experiment from "../../features/experiments/models/Experiment";
import { seedExperimentCatalog } from "../../features/experiments/services/experiment-catalog.service";

const other: ExperimentDefinition = {
  key: "other-v1",
  salt: "o1",
  holdoutBuckets: 0,
  variants: [
    { key: "control", weight: 5000 },
    { key: "treatment", weight: 5000 },
  ],
};

const stored = (key: string) =>
  Experiment.findOne({ key }).select("-_id -__v -createdAt -updatedAt").lean();

describe("seedExperimentCatalog against Mongo", () => {
  beforeAll(async () => {
    await Experiment.init();
  });

  it("inserts a new experiment as draft only", async () => {
    const result = await seedExperimentCatalog([saveTripCtaExperiment]);

    expect(result).toEqual({ created: ["save-trip-cta-v1"], existing: [] });
    expect(await stored("save-trip-cta-v1")).toEqual({
      ...saveTripCtaExperiment,
      status: "draft",
    });
  });

  it("leaves an existing experiment's status, salt and weights untouched", async () => {
    const running = {
      key: saveTripCtaExperiment.key,
      salt: "original-salt",
      status: "running",
      holdoutBuckets: 1000,
      variants: [
        { key: "control", weight: 4500 },
        { key: "labeled-cta", weight: 4500 },
      ],
    };
    await Experiment.create(running);

    const result = await seedExperimentCatalog([saveTripCtaExperiment, other]);

    expect(result).toEqual({
      created: ["other-v1"],
      existing: ["save-trip-cta-v1"],
    });
    expect(await stored("save-trip-cta-v1")).toEqual(running);
    expect(await stored("other-v1")).toEqual({ ...other, status: "draft" });
  });

  it("is idempotent: a second run creates nothing and keeps one doc", async () => {
    await seedExperimentCatalog([saveTripCtaExperiment]);
    const again = await seedExperimentCatalog([saveTripCtaExperiment]);

    expect(again).toEqual({ created: [], existing: ["save-trip-cta-v1"] });
    expect(await Experiment.countDocuments({ key: "save-trip-cta-v1" })).toBe(
      1,
    );
  });

  it("writes nothing when one definition is invalid", async () => {
    await expect(
      seedExperimentCatalog([
        other,
        { ...other, key: "bad-v1", holdoutBuckets: 1 },
      ]),
    ).rejects.toThrow(/bad-v1/);

    expect(await Experiment.countDocuments({})).toBe(0);
  });
});
