import type { ExperimentDefinition } from "../schemas/experiments.schema.js";

/**
 * Experiments the app knows how to render (B2 plan, PR 8). A definition
 * here is seeded into Mongo as `draft` by `npm run seed:experiments -w
 * backend` and never assigns anyone until the owner flips its status to
 * `running` (and EXPERIMENTS_ENABLED is "true"). Salts are fixed forever:
 * changing one reshuffles every user.
 */

/**
 * save-trip-cta-v1: does a labeled "Save trip" button, instead of the
 * icon-only check, raise `trip_saved` when a user edits a trip's name?
 */
export const SAVE_TRIP_CTA_EXPERIMENT_KEY = "save-trip-cta-v1";
export const SAVE_TRIP_CTA_VARIANTS = {
  control: "control",
  labeled: "labeled-cta",
} as const;

export const saveTripCtaExperiment: ExperimentDefinition = {
  key: SAVE_TRIP_CTA_EXPERIMENT_KEY,
  salt: "stc1-7d41e2",
  holdoutBuckets: 0,
  variants: [
    { key: SAVE_TRIP_CTA_VARIANTS.control, weight: 5000 },
    { key: SAVE_TRIP_CTA_VARIANTS.labeled, weight: 5000 },
  ],
};

export const EXPERIMENT_CATALOG: readonly ExperimentDefinition[] = [
  saveTripCtaExperiment,
];
