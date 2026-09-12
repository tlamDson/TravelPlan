import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { TripPreferencesSchema } from "@travelplan/shared";
import { createWorker } from "../../lib/queue";
import { QUEUE_NAMES } from "../../lib/queue-defaults";
import { tripGeneratorProcessor } from "../../features/planner/jobs/trip.processor";
import { attachJobMetrics } from "../../features/reliability/services/attach-job-metrics";
import { aiAgentService } from "../../features/planner/services/ai-agent.service";
import { tripQueue, TRIP_JOB_OPTIONS } from "../../features/planner/trip.queue";
import { tripRepository } from "../../features/planner/repositories/trip.repository";
import JobMetric from "../../features/reliability/models/JobMetric";
import Trip from "../../features/planner/models/Trip";

/**
 * Proves the false-healthy failure mode end-to-end through a REAL BullMQ
 * Worker (not just the queue-add half other integration tests cover):
 * when Gemini is dead, trip.processor.ts's catch block writes a static
 * fallback itinerary and returns `{ success: true, status: "FALLBACK" }`
 * to BullMQ on purpose (see the "DO NOT THROW error here" comment at
 * trip.processor.ts) — so BullMQ itself reports the job `completed`.
 * This is not hypothetical: gemini-2.0-flash was deprecated in
 * production and every trip silently became a static template while
 * dashboards stayed green, until commit f62baef (2026-08-15).
 *
 * This test pins the single string coupling the reliability layer relies
 * on to see through that (`job.returnvalue.status === "FALLBACK"` in
 * job-outcome.ts's deriveOutcome) — if the processor's return string
 * ever drifts, this test catches it, not a dashboard nobody is watching.
 */
describe("false-healthy fault injection — BullMQ says completed while JobMetric says fallback", () => {
  let worker: ReturnType<typeof createWorker>;

  beforeAll(() => {
    worker = createWorker(QUEUE_NAMES.TRIP_GENERATION, tripGeneratorProcessor, {
      concurrency: 2,
      lockDuration: 30_000,
    });
    attachJobMetrics(worker, QUEUE_NAMES.TRIP_GENERATION);
  });

  afterAll(async () => {
    // Registered after the setupFile's beforeAll/afterAll, so by vitest's
    // stack-like teardown order this runs BEFORE integration-setup.ts's
    // afterAll disconnects Mongo and obliterates the queue.
    await worker.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function enqueueTripJob(params: {
    destination: string;
    userTier: "free" | "pro";
    attempts?: number;
  }): Promise<{ tripId: string; jobId: string }> {
    const preferences = TripPreferencesSchema.parse({
      destination: params.destination,
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2026-09-03T00:00:00.000Z",
      budget: { total: 500, currency: "USD" },
      travelers: { adults: 1, children: 0 },
    });

    const trip = await tripRepository.create({
      userId: "false-healthy-test-user",
      title: `False-healthy test — ${params.destination}`,
      destination: preferences.destination,
      startDate: new Date(preferences.startDate),
      endDate: new Date(preferences.endDate),
      budget: {
        currency: preferences.budget.currency,
        totalLimit: preferences.budget.total,
        totalSpent: 0,
        breakdown: [],
      },
      itinerary: [],
      cities: [],
      status: "QUEUED",
    });

    const job = await tripQueue.add(
      "generate-trip",
      {
        userId: "false-healthy-test-user",
        tripId: trip._id.toString(),
        preferences,
        userTier: params.userTier,
      },
      {
        priority: params.userTier === "pro" ? 1 : 10,
        ...TRIP_JOB_OPTIONS,
        ...(params.attempts ? { attempts: params.attempts } : {}),
      },
    );

    await tripRepository.acquireLock(trip._id, job.id as string);

    return { tripId: trip._id.toString(), jobId: job.id as string };
  }

  async function waitForJobMetric(jobId: string, timeoutMs = 15_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const doc = await JobMetric.findOne({ jobId }).lean();
      if (doc) return doc;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(
      `JobMetric for job ${jobId} was not recorded within ${timeoutMs}ms`,
    );
  }

  it("records outcome 'fallback' + Trip.status FALLBACK while BullMQ itself reports the job 'completed' (Hanoi, free tier — the real outage shape)", async () => {
    vi.spyOn(aiAgentService, "generateIntentsWithRetry").mockRejectedValue(
      new Error(
        "[404 Not Found] models/gemini-3.6-flash is not found for API version v1beta, or is not supported for generateContent",
      ),
    );

    const { tripId, jobId } = await enqueueTripJob({
      destination: "Hanoi, Vietnam",
      userTier: "free",
    });

    const metric = await waitForJobMetric(jobId);
    expect(metric.outcome).toBe("fallback");

    const job = await tripQueue.getJob(jobId);
    expect(await job!.getState()).toBe("completed");

    const trip = await Trip.findById(tripId).lean();
    expect(trip?.status).toBe("FALLBACK");
  }, 20_000);

  it("a non-MVP destination throws instead of falling back — BullMQ honestly reports 'failed' (control group)", async () => {
    vi.spyOn(aiAgentService, "generateIntentsWithRetry").mockRejectedValue(
      new Error("simulated Gemini outage"),
    );

    // attempts: 1 — TRIP_JOB_OPTIONS' default (3 attempts, 5s exponential
    // backoff) would blow past this test's timeout for an honest failure
    // that isn't eligible for the fallback path anyway.
    const { tripId, jobId } = await enqueueTripJob({
      destination: "Tokyo, Japan",
      userTier: "free",
      attempts: 1,
    });

    const metric = await waitForJobMetric(jobId);
    expect(metric.outcome).toBe("failed");

    const job = await tripQueue.getJob(jobId);
    expect(await job!.getState()).toBe("failed");

    const trip = await Trip.findById(tripId).lean();
    expect(trip?.status).toBe("FAILED");
  }, 20_000);
});
