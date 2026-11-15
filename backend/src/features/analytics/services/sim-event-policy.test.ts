import { describe, it, expect } from "vitest";
import { analyticsEventSchema, type AnalyticsEvent } from "@travelplan/shared";
import { simPolicyViolation } from "./sim-event-policy";

const base = {
  eventId: "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f",
  schemaVersion: 1,
  occurredAt: "2026-11-01T10:00:00.000Z",
  sessionId: "sim-s-000001-0001",
  source: "web",
  name: "trip_viewed",
  properties: { tripId: "sim-t-1" },
};
const ev = (over: Record<string, unknown>): AnalyticsEvent =>
  analyticsEventSchema.parse({ ...base, userId: "sim-u-000001", ...over });

describe("simPolicyViolation", () => {
  it("allows an event of a simulated user", () => {
    expect(simPolicyViolation(ev({}))).toBeNull();
  });

  it("allows an anonymous event", () => {
    expect(simPolicyViolation(ev({ userId: null }))).toBeNull();
  });

  it("allows the server-sourced exposure simkit writes for a simulated user", () => {
    const exposure = ev({
      source: "server",
      name: "experiment_exposure",
      properties: {
        experimentKey: "save-trip-cta-v1",
        variant: "treatment",
        bucket: 42,
      },
    });
    expect(simPolicyViolation(exposure)).toBeNull();
  });

  it("quarantines a userId that is not a simulated one, so no sim event lands in a real user's history", () => {
    for (const userId of ["user_2abc", "simu-1", "SIM-u-1"]) {
      expect(simPolicyViolation(ev({ userId }))).toEqual({
        reason: "user_mismatch",
        issues: [{ path: "userId", code: "not_simulated" }],
      });
    }
  });
});
