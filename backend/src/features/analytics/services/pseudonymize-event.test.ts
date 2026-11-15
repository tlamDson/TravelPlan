import { createHmac } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { analyticsEventSchema, type AnalyticsEvent } from "@travelplan/shared";

const SECRET = "test-analytics-hash-secret-32-chars!";
vi.mock("../../../config/env", () => ({
  env: { ANALYTICS_HASH_SECRET: "test-analytics-hash-secret-32-chars!" },
}));
const hmac = (text: string) =>
  createHmac("sha256", SECRET).update(text).digest("hex");

import {
  READABLE_STRING_PROPERTIES,
  pseudonymizeEvent,
} from "./pseudonymize-event";

const envelope = {
  eventId: "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f",
  schemaVersion: 1 as const,
  occurredAt: "2026-11-01T10:00:00.000Z",
  sessionId: "someone@example.com",
  userId: "user_2abcDEF",
  source: "web" as const,
};
const completed: AnalyticsEvent = {
  ...envelope,
  name: "trip_generation_completed",
  properties: {
    jobId: "0912345678",
    tripId: "Bob Smith",
    outcome: "completed",
    durationMs: 1200,
  },
};

describe("pseudonymizeEvent", () => {
  it("replaces userId, sessionId and free-string properties with keyed hashes", () => {
    const out = pseudonymizeEvent(completed);
    expect(out).toEqual({
      userId: hmac("user_2abcDEF"),
      sessionId: hmac("sessionId:someone@example.com"),
      properties: {
        jobId: hmac("jobId:0912345678"),
        tripId: hmac("tripId:Bob Smith"),
        outcome: "completed",
        durationMs: 1200,
      },
    });
    const text = JSON.stringify(out);
    for (const raw of [
      "someone@example.com",
      "user_2abcDEF",
      "0912345678",
      "Bob Smith",
    ]) {
      expect(text).not.toContain(raw);
    }
  });

  it("keeps an anonymous userId as null", () => {
    expect(pseudonymizeEvent({ ...completed, userId: null }).userId).toBeNull();
  });

  it("hashes the same id to the same value across event types, so events still join", () => {
    const requested: AnalyticsEvent = {
      ...envelope,
      name: "trip_generation_requested",
      properties: { jobId: "0912345678", durationDays: 3, destinationCount: 1 },
    };
    expect(pseudonymizeEvent(requested).properties.jobId).toBe(
      pseudonymizeEvent(completed).properties.jobId,
    );
    expect(pseudonymizeEvent(requested).sessionId).toBe(
      pseudonymizeEvent(completed).sessionId,
    );
  });

  it("does not hash the same text to the same value in different fields", () => {
    const out = pseudonymizeEvent({
      ...envelope,
      sessionId: "same",
      name: "trip_viewed",
      properties: { tripId: "same" },
    });
    expect(out.sessionId).not.toBe(out.properties.tripId);
  });

  it("keeps closed-set values (enum) and numbers readable", () => {
    const out = pseudonymizeEvent({
      ...envelope,
      name: "itinerary_edited",
      properties: { tripId: "t-1", editType: "reorder", dayIndex: 2 },
    });
    expect(out.properties).toEqual({
      tripId: hmac("tripId:t-1"),
      editType: "reorder",
      dayIndex: 2,
    });
  });

  it("keeps the experiment key and variant readable (slugs written by the server only)", () => {
    const out = pseudonymizeEvent({
      ...envelope,
      source: "server",
      name: "experiment_exposure",
      properties: {
        experimentKey: "new-wizard",
        variant: "control",
        bucket: 7,
      },
    });
    expect(out.properties).toEqual({
      experimentKey: "new-wizard",
      variant: "control",
      bucket: 7,
    });
  });
});

describe("catalog guard", () => {
  const options = analyticsEventSchema.options;

  it("readable string properties exist only on events a client cannot send", () => {
    for (const name of Object.keys(READABLE_STRING_PROPERTIES)) {
      const option = options.find((o) => o.shape.name.value === name);
      expect(option, name).toBeDefined();
      const source: unknown = option!.shape.source;
      expect(source, name).toBeInstanceOf(z.ZodLiteral);
      expect((source as z.ZodLiteral).value).toBe("server");
    }
  });

  it("every catalog property is a string, number or closed set — a new kind needs a pseudonymization decision", () => {
    for (const option of options) {
      for (const [key, schema] of Object.entries(
        option.shape.properties.shape,
      )) {
        const known =
          schema instanceof z.ZodString ||
          schema instanceof z.ZodNumber ||
          schema instanceof z.ZodEnum ||
          schema instanceof z.ZodLiteral;
        expect(known, `${option.shape.name.value}.${key}`).toBe(true);
      }
    }
  });
});
