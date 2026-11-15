import WorkerHeartbeat, { IWorkerHeartbeat } from "../models/WorkerHeartbeat";

export interface HeartbeatData {
  workerId: string;
  host: string;
  queues: string[];
  concurrency: Record<string, number>;
  startedAt: Date;
  lastBeatAt: Date;
}

export class WorkerHeartbeatRepository {
  /** Refreshes the full document every call ($set, not $setOnInsert) —
   * unlike JobMetric's record-once semantics, a heartbeat must actually
   * move lastBeatAt forward on each beat. */
  async upsertBeat(data: HeartbeatData): Promise<void> {
    await WorkerHeartbeat.updateOne(
      { workerId: data.workerId },
      { $set: data },
      { upsert: true },
    );
  }

  async incrementStalled(workerId: string): Promise<void> {
    await WorkerHeartbeat.updateOne(
      { workerId },
      { $inc: { stalledCount: 1 } },
    );
  }

  async findAll(): Promise<IWorkerHeartbeat[]> {
    return WorkerHeartbeat.find({}).lean();
  }
}

export const workerHeartbeatRepository = new WorkerHeartbeatRepository();
