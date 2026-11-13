import { describe, it, expect } from "vitest";
import {
  EXPERIMENT_CATALOG,
  SAVE_TRIP_CTA_EXPERIMENT_KEY,
  SAVE_TRIP_CTA_VARIANTS,
  saveTripCtaExperiment,
} from "../experiments";
import { experimentDefinitionSchema } from "../../schemas/experiments.schema";

describe("save-trip-cta-v1 definition", () => {
  it("is a valid experiment definition", () => {
    expect(
      experimentDefinitionSchema.safeParse(saveTripCtaExperiment).success,
    ).toBe(true);
  });

  it("uses the planned key", () => {
    expect(SAVE_TRIP_CTA_EXPERIMENT_KEY).toBe("save-trip-cta-v1");
    expect(saveTripCtaExperiment.key).toBe(SAVE_TRIP_CTA_EXPERIMENT_KEY);
  });

  it("splits users 50/50 between control and the labeled CTA, no holdout", () => {
    expect(saveTripCtaExperiment.holdoutBuckets).toBe(0);
    expect(saveTripCtaExperiment.variants).toEqual([
      { key: SAVE_TRIP_CTA_VARIANTS.control, weight: 5000 },
      { key: SAVE_TRIP_CTA_VARIANTS.labeled, weight: 5000 },
    ]);
    expect(SAVE_TRIP_CTA_VARIANTS).toEqual({
      control: "control",
      labeled: "labeled-cta",
    });
  });
});

describe("EXPERIMENT_CATALOG", () => {
  it("lists save-trip-cta-v1", () => {
    expect(EXPERIMENT_CATALOG.map((d) => d.key)).toContain("save-trip-cta-v1");
  });

  it("has unique keys and unique salts", () => {
    const keys = EXPERIMENT_CATALOG.map((d) => d.key);
    const salts = EXPERIMENT_CATALOG.map((d) => d.salt);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(salts).size).toBe(salts.length);
  });
});
