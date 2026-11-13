import { describe, it, expect, vi } from "vitest";
import { analyticsEventSchema } from "@travelplan/shared";

vi.mock("../../../config/env", () => ({
  env: { ANALYTICS_HASH_SECRET: "e".repeat(32) },
}));

import { buildExposureEvent, exposureEventId } from "./exposure-event";

const NOW = new Date("2026-11-13T10:00:00.000Z");

describe("exposureEventId", () => {
  it("is a valid UUID that is stable for one user, experiment and session", () => {
    const id = exposureEventId("save-trip-cta-v1", "user_1", "sess-1");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(exposureEventId("save-trip-cta-v1", "user_1", "sess-1")).toBe(id);
  });

  it("differs when the session, the user or the experiment differs", () => {
    const ids = new Set([
      exposureEventId("save-trip-cta-v1", "user_1", "sess-1"),
      exposureEventId("save-trip-cta-v1", "user_1", "sess-2"),
      exposureEventId("save-trip-cta-v1", "user_2", "sess-1"),
      exposureEventId("other-v1", "user_1", "sess-1"),
    ]);
    expect(ids.size).toBe(4);
  });

  it("does not let field boundaries collide (a:b + c vs a + b:c)", () => {
    expect(exposureEventId("exp", "a:b", "c")).not.toBe(
      exposureEventId("exp", "a", "b:c"),
    );
  });

  it("does not contain the raw userId or sessionId", () => {
    const id = exposureEventId("exp", "user_abc", "sess_xyz");
    expect(id).not.toContain("user_abc");
    expect(id).not.toContain("sess_xyz");
  });
});

describe("buildExposureEvent", () => {
  it("builds a catalog-valid server experiment_exposure event", () => {
    const event = buildExposureEvent({
      experimentKey: "save-trip-cta-v1",
      userId: "user_1",
      sessionId: "sess-1",
      assignment: { bucket: 4321, variant: "treatment" },
      now: NOW,
    });
    expect(analyticsEventSchema.parse(event)).toEqual({
      eventId: exposureEventId("save-trip-cta-v1", "user_1", "sess-1"),
      schemaVersion: 1,
      name: "experiment_exposure",
      occurredAt: NOW.toISOString(),
      sessionId: "sess-1",
      userId: "user_1",
      source: "server",
      properties: {
        experimentKey: "save-trip-cta-v1",
        variant: "treatment",
        bucket: 4321,
      },
    });
  });
});
