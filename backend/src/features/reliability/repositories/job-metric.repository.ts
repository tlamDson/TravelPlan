import type { JobOutcome } from "@travelplan/shared";
import JobMetric from "../models/JobMetric";
import type { JobMetricInput } from "../services/job-outcome";

const DEFAULT_LATENCY_SAMPLE_LIMIT = 5000;

export class JobMetricRepository {
  /**
   * Idempotent upsert keyed on {queue, jobId} — a stalled job can be
   * re-picked-up and completed twice, and BullMQ can re-emit events on
   * reconnect. $setOnInsert means a second write for the same job is a
   * no-op, not an overwrite. A genuine race between two concurrent
   * upserts can still throw E11000 on the unique index; that's treated
   * as success (the doc already exists — the goal was achieved).
   */
  async record(input: JobMetricInput): Promise<void> {
    try {
      await JobMetric.updateOne(
        { queue: input.queue, jobId: input.jobId },
        { $setOnInsert: input },
        { upsert: true },
      );
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 11000) return;
      throw err;
    }
  }

  async countByOutcome(
    queue: string,
    since: Date,
    until: Date,
  ): Promise<Record<JobOutcome, number>> {
    const rows: Array<{ _id: JobOutcome; count: number }> =
      await JobMetric.aggregate([
        { $match: { queue, finishedAt: { $gte: since, $lt: until } } },
        { $group: { _id: "$outcome", count: { $sum: 1 } } },
      ]);

    const result: Record<JobOutcome, number> = {
      completed: 0,
      fallback: 0,
      failed: 0,
    };
    for (const row of rows) {
      result[row._id] = row.count;
    }
    return result;
  }

  /** Breakdown of non-completed outcomes by reason — answers "SLI is low
   * because of what" instead of just "SLI is low". A missing
   * failureReason (fallback path predates the field, or a bug drops it)
   * is labeled UNKNOWN rather than silently dropped from the total. */
  async countByFailureReason(
    queue: string,
    since: Date,
    until: Date,
  ): Promise<Record<string, number>> {
    const rows: Array<{ _id: string | null; count: number }> =
      await JobMetric.aggregate([
        {
          $match: {
            queue,
            finishedAt: { $gte: since, $lt: until },
            outcome: { $ne: "completed" },
          },
        },
        { $group: { _id: "$failureReason", count: { $sum: 1 } } },
      ]);

    const result: Record<string, number> = {};
    for (const row of rows) {
      const key = row._id ?? "UNKNOWN";
      result[key] = row.count;
    }
    return result;
  }

  /** Projected to only the 3 latency fields + hard limit — never load
   * whole documents or an unbounded window into API memory. */
  findLatencySamples(
    queue: string,
    since: Date,
    until: Date,
    limit: number = DEFAULT_LATENCY_SAMPLE_LIMIT,
  ) {
    return JobMetric.find(
      { queue, finishedAt: { $gte: since, $lt: until } },
      { queueWaitMs: 1, processingMs: 1, endToEndMs: 1, _id: 0 },
    )
      .limit(limit)
      .lean();
  }

  async countSince(queue: string, since: Date): Promise<number> {
    return JobMetric.countDocuments({ queue, finishedAt: { $gte: since } });
  }

  /** Completed jobs slower than `thresholdMs` — folded into the SLI as
   * bad by slo-math.ts's computeSli() even though BullMQ itself reports
   * these as successful completions. */
  async countSlowCompleted(
    queue: string,
    since: Date,
    until: Date,
    thresholdMs: number,
  ): Promise<number> {
    return JobMetric.countDocuments({
      queue,
      finishedAt: { $gte: since, $lt: until },
      outcome: "completed",
      endToEndMs: { $gt: thresholdMs },
    });
  }
}

export const jobMetricRepository = new JobMetricRepository();
