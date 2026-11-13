import mongoose, { Schema } from "mongoose";
import {
  EXPERIMENT_STATUSES,
  type ExperimentDefinition,
  type ExperimentStatus,
} from "@travelplan/shared";

/**
 * One experiment (B2 plan, PR 6). Only `running` experiments assign users
 * or accept exposures. The service re-validates every doc with
 * experimentDefinitionSchema (weights + holdout = 10,000 buckets) before
 * using it, so a hand-edited doc that breaks the rules is skipped, not
 * served. Changing `salt` reshuffles every user — treat it as immutable
 * once an experiment has run.
 */
export interface IExperiment extends ExperimentDefinition {
  status: ExperimentStatus;
  description?: string;
}

const ExperimentSchema = new Schema<IExperiment>(
  {
    key: { type: String, required: true, unique: true },
    salt: { type: String, required: true },
    status: {
      type: String,
      enum: EXPERIMENT_STATUSES,
      required: true,
      default: "draft",
    },
    holdoutBuckets: { type: Number, required: true, default: 0 },
    variants: {
      type: [
        {
          _id: false,
          key: { type: String, required: true },
          weight: { type: Number, required: true },
        },
      ],
      required: true,
    },
    description: { type: String },
  },
  { collection: "experiments", timestamps: true },
);

ExperimentSchema.index({ status: 1, key: 1 });

export default mongoose.model<IExperiment>("Experiment", ExperimentSchema);
