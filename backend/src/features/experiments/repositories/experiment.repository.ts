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
}

export const experimentRepository = new ExperimentRepository();
