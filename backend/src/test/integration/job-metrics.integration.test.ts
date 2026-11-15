import { describe, it, expect } from "vitest";
import JobMetric from "../../features/reliability/models/JobMetric";
import { jobMetricRepository } from "../../features/reliability/repositories/job-metric.repository";

const sampleInput = {
  queue: "trip-generation",
  jobName: "generate-trip",
  jobId: "integration-job-1",
  outcome: "completed" as const,
  attemptsMade: 1,
  queueWaitMs: 100,
  processingMs: 200,
  endToEndMs: 300,
  finishedAt: new Date(),
};

describe("JobMetric recording — real Mongo", () => {
  it("upserting the same {queue, jobId} twice results in exactly one document", async () => {
    // Simulates a stalled job whose lock expired being re-picked-up and
    // completed twice, or BullMQ re-emitting an event on reconnect — the
    // recorder must not double-count the SLI for one real job.
    await jobMetricRepository.record(sampleInput);
    await jobMetricRepository.record(sampleInput);

    const count = await JobMetric.countDocuments({
      queue: sampleInput.queue,
      jobId: sampleInput.jobId,
    });
    expect(count).toBe(1);
  });

  it("has a TTL index on expiresAt — invisible until Mongo is full if this were ever dropped", async () => {
    const indexes = await JobMetric.collection.indexes();
    const ttlIndex = indexes.find(
      (idx) =>
        idx.key?.expiresAt === 1 && typeof idx.expireAfterSeconds === "number",
    );
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.expireAfterSeconds).toBe(0);
  });

  it("has a unique index on {queue, jobId} — correctness (dedup), not tidiness", async () => {
    const indexes = await JobMetric.collection.indexes();
    const uniqueIndex = indexes.find(
      (idx) =>
        idx.key?.queue === 1 && idx.key?.jobId === 1 && idx.unique === true,
    );
    expect(uniqueIndex).toBeDefined();
  });

  it("records a real document with all required fields queryable back", async () => {
    await jobMetricRepository.record(sampleInput);

    const doc = await JobMetric.findOne({
      queue: sampleInput.queue,
      jobId: sampleInput.jobId,
    }).lean();

    expect(doc?.outcome).toBe("completed");
    expect(doc?.endToEndMs).toBe(300);
    expect(doc?.expiresAt).toBeInstanceOf(Date);
  });
});
