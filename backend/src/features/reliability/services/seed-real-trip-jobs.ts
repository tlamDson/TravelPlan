import { TripPreferencesSchema } from "@travelplan/shared";
import type { TripPreferences } from "@travelplan/shared";
import { tripQueue, TRIP_JOB_OPTIONS } from "../../planner/trip.queue";
import { tripRepository } from "../../planner/repositories/trip.repository";

/**
 * Enqueues REAL trip-generation jobs — real Gemini calls, real worker
 * processing — bypassing Clerk entirely (no HTTP layer, no session).
 * `trip.processor.ts` never looks up a real Clerk User record, so a
 * fixed synthetic userId is safe: the only place that would touch it is
 * the pro credit-refund in worker.ts on an exhausted failure, which just
 * no-ops (findOneAndUpdate on a non-existent user) rather than crashing.
 *
 * Used only by backend/scripts/seed-real-trip-jobs.ts, to validate the
 * whole reliability-recording pipeline against real outcomes (including a
 * real FALLBACK if the day's Gemini free-tier quota runs out mid-run) —
 * unlike synthetic-seed.ts, which proves nothing about the real code.
 */
export const SEED_USER_ID = "seed-test-user";

/** A few distinct trips so latency/outcome vary — Places cache hits would
 * otherwise make every job equally fast, defeating the point of seeding
 * real traffic. Parsed through TripPreferencesSchema (not cast) so this
 * goes through the same Zod validation + defaults (pace, activitiesPerDay,
 * etc.) a real request does — Zero Trust applies here too, since these
 * enqueue into the exact same queue real users' trips use. */
export const DEFAULT_PREFERENCES_VARIANTS: TripPreferences[] = [
  {
    destination: "Hanoi, Vietnam",
    startDate: "2026-09-01T00:00:00.000Z",
    endDate: "2026-09-03T00:00:00.000Z",
    budget: { total: 500, currency: "USD" },
    travelers: { adults: 1, children: 0 },
  },
  {
    destination: "Da Nang, Vietnam",
    startDate: "2026-09-05T00:00:00.000Z",
    endDate: "2026-09-08T00:00:00.000Z",
    budget: { total: 800, currency: "USD" },
    travelers: { adults: 2, children: 0 },
  },
  {
    destination: "Ho Chi Minh City, Vietnam",
    startDate: "2026-09-10T00:00:00.000Z",
    endDate: "2026-09-11T00:00:00.000Z",
    budget: { total: 300, currency: "USD" },
    travelers: { adults: 1, children: 0 },
  },
].map((v) => TripPreferencesSchema.parse(v));

export interface EnqueueRealTripJobsOptions {
  count: number;
  intervalMs: number;
  userTier: "free" | "pro";
  variants?: TripPreferences[];
  onEnqueued?: (jobId: string, index: number) => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enqueueRealTripJobs(
  options: EnqueueRealTripJobsOptions,
): Promise<number> {
  const variants = options.variants ?? DEFAULT_PREFERENCES_VARIANTS;
  const priority = options.userTier === "pro" ? 1 : 10;
  let enqueued = 0;

  for (let i = 0; i < options.count; i++) {
    const preferences = variants[i % variants.length]!;

    const trip = await tripRepository.create({
      userId: SEED_USER_ID,
      title: `Seed trip ${i + 1} — ${preferences.destination}`,
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
        userId: SEED_USER_ID,
        tripId: trip._id.toString(),
        preferences,
        userTier: options.userTier,
      },
      { priority, ...TRIP_JOB_OPTIONS },
    );

    await tripRepository.acquireLock(trip._id, job.id as string);
    enqueued++;
    options.onEnqueued?.(job.id as string, i);

    if (i < options.count - 1) {
      await delay(options.intervalMs);
    }
  }

  return enqueued;
}
