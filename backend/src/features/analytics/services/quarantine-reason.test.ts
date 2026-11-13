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

  it("keeps only each issue's path and zod code, never zod's message", () => {
    const out = classify({ ...valid, eventId: "x" });
    expect(out.issues).toEqual([{ path: "eventId", code: "invalid_format" }]);
  });

  it("does not echo an unknown key name (zod puts it in the message)", () => {
    const out = classify({ ...valid, "someone@example.com": 1 });
    expect(out.reason).toBe("unknown_field");
    expect(out.issues).toEqual([{ path: "", code: "unrecognized_keys" }]);
    expect(JSON.stringify(out)).not.toContain("someone@example.com");
  });

  it("does not echo an unknown property key", () => {
    const out = classify({
      ...valid,
      properties: { tripId: "t-1", "user_2abcDEF": "x" },
    });
    expect(out.issues).toEqual([
      { path: "properties", code: "unrecognized_keys" },
    ]);
    expect(JSON.stringify(out)).not.toContain("user_2abcDEF");
  });

  it("masks path segments that are not catalog field names", () => {
    const issues = [
      {
        code: "custom" as const,
        path: ["properties", "bob@example.com", 3, "tripId"],
        message: "bob@example.com is bad",
        input: undefined,
      },
    ];
    expect(classifyQuarantine({}, issues).issues).toEqual([
      { path: "properties.*.*.tripId", code: "custom" },
    ]);
  });

  it("masks an issue code that is not code-shaped", () => {
    const issues = [
      {
        code: "bob@example.com" as "custom",
        path: ["name"],
        message: "bad",
        input: undefined,
      },
    ];
    expect(classifyQuarantine({}, issues).issues).toEqual([
      { path: "name", code: "unknown" },
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
