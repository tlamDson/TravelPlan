import { describe, it, expect } from "vitest";
import {
  ANALYTICS_BATCH_MAX_EVENTS,
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_SCHEMA_VERSION,
  analyticsEventBatchSchema,
  analyticsEventSchema,
  analyticsIngestResultSchema,
} from "../analytics.schema";
import { MAX_TRIP_DAYS } from "../../constants/trip";

const envelope = {
  eventId: "0b7c6f0e-0000-4000-8000-000000000001",
  schemaVersion: 1,
  occurredAt: "2026-11-01T09:00:00.000Z",
  sessionId: "sess-1",
  userId: "user_abc",
  source: "web",
};

const validByName: Record<string, Record<string, unknown>> = {
  wizard_started: { entryPoint: "dashboard" },
  trip_generation_requested: {
    jobId: "job-1",
    durationDays: 3,
    destinationCount: 1,
  },
  trip_generation_completed: {
    jobId: "job-1",
    tripId: "trip-1",
    outcome: "completed",
    durationMs: 42000,
  },
  trip_viewed: { tripId: "trip-1" },
  itinerary_edited: { tripId: "trip-1", editType: "reorder", dayIndex: 0 },
  trip_saved: { tripId: "trip-1" },
  calendar_synced: { tripId: "trip-1", provider: "google" },
  experiment_exposure: {
    experimentKey: "save-trip-cta-v1",
    variant: "treatment",
    bucket: 4821,
  },
};

function eventOf(name: string, overrides: Record<string, unknown> = {}) {
  return {
    ...envelope,
    source: name === "experiment_exposure" ? "server" : "web",
    name,
    properties: validByName[name],
    ...overrides,
  };
}

describe("analytics catalog", () => {
  it("has the 7 product events plus experiment_exposure", () => {
    expect([...ANALYTICS_EVENT_NAMES].sort()).toEqual(
      Object.keys(validByName).sort(),
    );
    expect(ANALYTICS_SCHEMA_VERSION).toBe(1);
  });

  it.each(Object.keys(validByName))("accepts a valid %s", (name) => {
    const result = analyticsEventSchema.safeParse(eventOf(name));
    expect(result.error?.issues).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it("rejects an unknown event name", () => {
    expect(
      analyticsEventSchema.safeParse(
        eventOf("trip_saved", { name: "trip_deleted" }),
      ).success,
    ).toBe(false);
  });

  it("rejects properties that belong to another event", () => {
    const bad = eventOf("trip_saved", {
      properties: validByName.wizard_started,
    });
    expect(analyticsEventSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown property keys and unknown envelope keys (strict)", () => {
    expect(
      analyticsEventSchema.safeParse(
        eventOf("trip_saved", { properties: { tripId: "t", extra: 1 } }),
      ).success,
    ).toBe(false);
    expect(
      analyticsEventSchema.safeParse(eventOf("trip_saved", { email: "a@b.c" }))
        .success,
    ).toBe(false);
  });

  it("requires a UUID eventId", () => {
    expect(
      analyticsEventSchema.safeParse(eventOf("trip_saved", { eventId: "abc" }))
        .success,
    ).toBe(false);
  });

  it("requires the current schemaVersion", () => {
    expect(
      analyticsEventSchema.safeParse(
        eventOf("trip_saved", { schemaVersion: 2 }),
      ).success,
    ).toBe(false);
  });

  it("accepts an ISO datetime with offset and rejects a bare date", () => {
    expect(
      analyticsEventSchema.safeParse(
        eventOf("trip_saved", { occurredAt: "2026-11-03T01:30:00+07:00" }),
      ).success,
    ).toBe(true);
    expect(
      analyticsEventSchema.safeParse(
        eventOf("trip_saved", { occurredAt: "2026-11-03" }),
      ).success,
    ).toBe(false);
  });

  it("allows an anonymous event (userId null) but not a missing userId", () => {
    expect(
      analyticsEventSchema.safeParse(
        eventOf("wizard_started", { userId: null }),
      ).success,
    ).toBe(true);
    const { userId: _drop, ...noUser } = eventOf("wizard_started");
    expect(analyticsEventSchema.safeParse(noUser).success).toBe(false);
  });

  it("only accepts experiment_exposure from the server", () => {
    expect(
      analyticsEventSchema.safeParse(
        eventOf("experiment_exposure", { source: "web" }),
      ).success,
    ).toBe(false);
  });

  it("bounds the exposure bucket to 0..9999", () => {
    for (const [bucket, ok] of [
      [0, true],
      [9999, true],
      [10000, false],
      [-1, false],
      [1.5, false],
    ] as const) {
      const ev = eventOf("experiment_exposure", {
        properties: { ...validByName.experiment_exposure, bucket },
      });
      expect(analyticsEventSchema.safeParse(ev).success).toBe(ok);
    }
  });

  it("bounds durationDays to the longest trip the wizard allows", () => {
    expect(MAX_TRIP_DAYS).toBe(90);
    for (const [durationDays, ok] of [
      [1, true],
      [61, true],
      [MAX_TRIP_DAYS, true],
      [MAX_TRIP_DAYS + 1, false],
      [0, false],
    ] as const) {
      const ev = eventOf("trip_generation_requested", {
        properties: { ...validByName.trip_generation_requested, durationDays },
      });
      expect(analyticsEventSchema.safeParse(ev).success).toBe(ok);
    }
  });

  it("reuses the job outcome enum for trip_generation_completed", () => {
    const ev = eventOf("trip_generation_completed", {
      properties: {
        ...validByName.trip_generation_completed,
        outcome: "COMPLETED",
      },
    });
    expect(analyticsEventSchema.safeParse(ev).success).toBe(false);
  });
});

describe("analyticsEventBatchSchema", () => {
  it("keeps individual events unvalidated so one bad event cannot reject the batch", () => {
    const result = analyticsEventBatchSchema.safeParse({
      events: [eventOf("trip_saved"), { garbage: true }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty batch and one over the cap", () => {
    expect(analyticsEventBatchSchema.safeParse({ events: [] }).success).toBe(
      false,
    );
    const tooMany = Array.from({ length: ANALYTICS_BATCH_MAX_EVENTS + 1 }, () =>
      eventOf("trip_saved"),
    );
    expect(
      analyticsEventBatchSchema.safeParse({ events: tooMany }).success,
    ).toBe(false);
    expect(
      analyticsEventBatchSchema.safeParse({
        events: tooMany.slice(0, ANALYTICS_BATCH_MAX_EVENTS),
      }).success,
    ).toBe(true);
  });
});

describe("analyticsIngestResultSchema", () => {
  it("requires accepted + duplicates + quarantined = received", () => {
    expect(
      analyticsIngestResultSchema.safeParse({
        received: 15,
        accepted: 7,
        duplicates: 2,
        quarantined: 6,
      }).success,
    ).toBe(true);
    expect(
      analyticsIngestResultSchema.safeParse({
        received: 15,
        accepted: 7,
        duplicates: 2,
        quarantined: 5,
      }).success,
    ).toBe(false);
  });
});
