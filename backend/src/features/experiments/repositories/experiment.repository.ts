import type { ExperimentDefinition } from "@travelplan/shared";
import Experiment from "../models/Experiment";

/** Raw stored fields; the service validates them before use. */
const DEFINITION_FIELDS = "key salt holdoutBuckets variants -_id";

export class ExperimentRepository {
  /** Running experiments, sorted by key so responses are stable. */
  async findRunning(): Promise<unknown[]> {
    return Experiment.find({ status: "running" })
      .select(DEFINITION_FIELDS)
      .sort({ key: 1 })
      .lean();
  }

  async findRunningByKey(key: string): Promise<unknown | null> {
    return Experiment.findOne({ key, status: "running" })
      .select(DEFINITION_FIELDS)
      .lean();
  }

  /**
   * Inserts `def` as a draft when no experiment has its key. An existing
   * doc is left untouched (status, salt, weights), so re-seeding never
   * starts, stops or reshuffles an experiment. True when inserted.
   */
  async insertDraftIfMissing(def: ExperimentDefinition): Promise<boolean> {
    const result = await Experiment.updateOne(
      { key: def.key },
      { $setOnInsert: { ...def, status: "draft" } },
      { upsert: true },
    );
    return result.upsertedCount === 1;
  }
}

export const experimentRepository = new ExperimentRepository();
