import { describe, it, expect } from "vitest";
import { analyticsEventSchema, type AnalyticsEvent } from "@travelplan/shared";
import { clientPolicyViolation } from "./client-event-policy";

const base = {
  eventId: "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f",
  schemaVersion: 1,
  occurredAt: "2026-11-01T10:00:00.000Z",
  sessionId: "s-1",
  source: "web",
  name: "trip_viewed",
  properties: { tripId: "t-1" },
};
const ev = (over: Record<string, unknown>): AnalyticsEvent =>
  analyticsEventSchema.parse({ ...base, userId: null, ...over });

const exposure = ev({
  source: "server",
  name: "experiment_exposure",
  properties: { experimentKey: "cta-v1", variant: "control", bucket: 1 },
});

describe("clientPolicyViolation", () => {
  it("allows an anonymous event from an anonymous request", () => {
    expect(clientPolicyViolation(ev({}), null)).toBeNull();
  });

  it("allows an event whose userId is the signed-in user", () => {
    expect(
      clientPolicyViolation(ev({ userId: "user_1" }), "user_1"),
    ).toBeNull();
  });

  it("allows an anonymous event from a signed-in request (pre-login events of the session)", () => {
    expect(clientPolicyViolation(ev({}), "user_1")).toBeNull();
  });

  it("rejects a userId that is not the signed-in user as user_mismatch", () => {
    const out = clientPolicyViolation(ev({ userId: "user_2" }), "user_1");
    expect(out?.reason).toBe("user_mismatch");
    expect(out?.issues).toEqual([{ path: "userId", code: "user_mismatch" }]);
  });

  it("rejects a claimed userId on an anonymous request as user_mismatch", () => {
    expect(clientPolicyViolation(ev({ userId: "user_1" }), null)?.reason).toBe(
      "user_mismatch",
    );
  });

  it("rejects any source:'server' event over HTTP as wrong_source (exposure is server-written only)", () => {
    const out = clientPolicyViolation(exposure, null);
    expect(out?.reason).toBe("wrong_source");
    expect(out?.issues).toEqual([{ path: "source", code: "server_only" }]);
  });

  it("reports wrong_source before user_mismatch", () => {
    const spoofed = { ...exposure, userId: "user_2" };
    expect(clientPolicyViolation(spoofed, "user_1")?.reason).toBe(
      "wrong_source",
    );
  });
});
