import { z } from "zod";
import {
  ANALYTICS_BUCKET_COUNT,
  experimentExposureEventSchema,
} from "./analytics.schema.js";

/**
 * Experiment contracts (B2 plan, PR 6). Assignment itself runs on the
 * server (backend/src/features/experiments/services/assignment.ts):
 *   bucket = first 8 bytes (big-endian) of SHA-256(`salt:key:userId`)
 *            mod ANALYTICS_BUCKET_COUNT
 * Buckets below `holdoutBuckets` are the holdout; the rest walk the
 * variants' cumulative integer weights in order. Integer weights that sum
 * to exactly the remaining buckets keep TS and Python (hashlib) in
 * lockstep — no float rounding. packages/shared/fixtures/
 * assignment-vectors.json pins 10,000 results for both languages.
 */

/** Variant every holdout user gets; reserved, no experiment may use it. */
export const EXPERIMENT_HOLDOUT_VARIANT = "holdout";
export const EXPERIMENT_STATUSES = ["draft", "running", "stopped"] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

const exposureProperties = experimentExposureEventSchema.shape.properties.shape;
/** Same slug rules as the exposure event, so every assignment can be logged. */
export const experimentKeySchema = exposureProperties.experimentKey;
export const experimentVariantKeySchema = exposureProperties.variant;
const sessionIdSchema = experimentExposureEventSchema.shape.sessionId;

export const experimentVariantSchema = z.object({
  key: experimentVariantKeySchema,
  weight: z.number().int().min(1).max(ANALYTICS_BUCKET_COUNT),
});

export const experimentDefinitionSchema = z
  .object({
    key: experimentKeySchema,
    /** No ':' — it separates salt from key in the hash input. */
    salt: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[^:]+$/),
    holdoutBuckets: z
      .number()
      .int()
      .min(0)
      .max(ANALYTICS_BUCKET_COUNT - 1),
    variants: z.array(experimentVariantSchema).min(2),
  })
  .superRefine((def, ctx) => {
    const keys = def.variants.map((v) => v.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: "variant keys must be unique",
      });
    }
    if (keys.includes(EXPERIMENT_HOLDOUT_VARIANT)) {
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: `"${EXPERIMENT_HOLDOUT_VARIANT}" is reserved`,
      });
    }
    const total = def.variants.reduce((s, v) => s + v.weight, 0);
    if (total + def.holdoutBuckets !== ANALYTICS_BUCKET_COUNT) {
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: `variant weights + holdoutBuckets must equal ${ANALYTICS_BUCKET_COUNT}`,
      });
    }
  });
export type ExperimentDefinition = z.infer<typeof experimentDefinitionSchema>;

/** One user's variant in one running experiment. */
export const experimentAssignmentSchema = z.object({
  experimentKey: experimentKeySchema,
  variant: experimentVariantKeySchema,
});
export type ExperimentAssignment = z.infer<typeof experimentAssignmentSchema>;

/** Response of `GET /api/experiments/assignments`. */
export const experimentAssignmentsResponseSchema = z.object({
  assignments: z.array(experimentAssignmentSchema),
});
export type ExperimentAssignmentsResponse = z.infer<
  typeof experimentAssignmentsResponseSchema
>;

/**
 * Body of `POST /api/experiments/exposures`, sent when a variant renders.
 * Strict: the client never names its variant — the server recomputes it.
 */
export const experimentExposureRequestSchema = z.strictObject({
  experimentKey: experimentKeySchema,
  sessionId: sessionIdSchema,
});
export type ExperimentExposureRequest = z.infer<
  typeof experimentExposureRequestSchema
>;

/** `recorded: false` = this session's exposure was already stored. */
export const experimentExposureResponseSchema =
  experimentAssignmentSchema.extend({ recorded: z.boolean() });
export type ExperimentExposureResponse = z.infer<
  typeof experimentExposureResponseSchema
>;
