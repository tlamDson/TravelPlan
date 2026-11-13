import { describe, it, expect } from "vitest";
import { analyticsEventSchema } from "@travelplan/shared";
import { classifyQuarantine } from "./quarantine-reason";

const valid = {
  eventId: "6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f",
  schemaVersion: 1,
  occurredAt: "2026-11-01T10:00:00.000Z",
  sessionId: "s-1",
  userId: null,
  source: "web",
  name: "trip_viewed",
  properties: { tripId: "t-1" },
};

function classify(raw: unknown) {
  const result = analyticsEventSchema.safeParse(raw);
  if (result.success) throw new Error("expected an invalid event");
  return classifyQuarantine(raw, result.error.issues);
}

describe("classifyQuarantine", () => {
  it("labels a name outside the catalog as unknown_event", () => {
    expect(classify({ ...valid, name: "trip_deleted" }).reason).toBe(
      "unknown_event",
    );
  });

  it("labels a missing name as unknown_event", () => {
    const { name: _name, ...noName } = valid;
    expect(classify(noName).reason).toBe("unknown_event");
  });

  it("labels a bad source as wrong_source", () => {
    expect(classify({ ...valid, source: "desktop" }).reason).toBe(
      "wrong_source",
    );
  });

  it("labels an absent envelope field as missing_field", () => {
    const { sessionId: _s, ...noSession } = valid;
    const out = classify(noSession);
    expect(out.reason).toBe("missing_field");
    expect(out.issues[0]?.path).toBe("sessionId");
  });

  it("labels an absent property as missing_field with the dotted path", () => {
    const out = classify({ ...valid, properties: {} });
    expect(out.reason).toBe("missing_field");
    expect(out.issues.map((i) => i.path)).toEqual(["properties.tripId"]);
  });

  it("labels a missing properties object as missing_field", () => {
    const { properties: _p, ...noProps } = valid;
    expect(classify(noProps).reason).toBe("missing_field");
  });

  it("labels a value of the wrong type as wrong_type", () => {
    expect(classify({ ...valid, properties: { tripId: 5 } }).reason).toBe(
      "wrong_type",
    );
  });

  it("labels a malformed string (non-UUID eventId) as wrong_type", () => {
    expect(classify({ ...valid, eventId: "not-a-uuid" }).reason).toBe(
      "wrong_type",
    );
  });

  it("labels a non-object event as wrong_type", () => {
    expect(classify(42).reason).toBe("wrong_type");
    expect(classify(null).reason).toBe("wrong_type");
  });

  it("labels an extra key as unknown_field", () => {
    expect(classify({ ...valid, extra: 1 }).reason).toBe("unknown_field");
  });

  it("prefers the most specific reason when an event has several issues", () => {
    const { sessionId: _s, ...noSession } = valid;
    const out = classify({ ...noSession, source: "desktop", extra: 1 });
    expect(out.reason).toBe("wrong_source");
    expect(out.issues.map((i) => i.path).sort()).toEqual([
      "",
      "sessionId",
      "source",
    ]);
  });

  it("keeps each issue's zod code and message", () => {
    const out = classify({ ...valid, eventId: "x" });
    expect(out.issues).toEqual([
      { path: "eventId", code: "invalid_format", message: "Invalid UUID" },
    ]);
  });

  it("caps the number of stored issues", () => {
    const issues = Array.from({ length: 100 }, (_, i) => ({
      code: "custom" as const,
      path: [`f${i}`],
      message: "bad",
      input: undefined,
    }));
    expect(classifyQuarantine({}, issues).issues).toHaveLength(20);
  });
});
