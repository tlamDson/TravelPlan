import { analyticsEventSchema, type AnalyticsEvent } from "@travelplan/shared";
import { describe, expect, it, vi } from "vitest";
import {
  createAnalyticsClient,
  type AnalyticsClientOptions,
  type AnalyticsTransport,
  type ClientEventName,
  type InvalidEventReport,
} from "../lib/analytics-client";

/**
 * TypeScript does not stop a widened object, an `as` cast or untyped JS from
 * passing extra keys (an email, a name). The client must check every event
 * against the shared Zod catalog at runtime and never queue one that fails.
 */

function setup(overrides: Partial<AnalyticsClientOptions> = {}) {
  const sent: AnalyticsEvent[] = [];
  const beaconed: AnalyticsEvent[] = [];
  const transport: AnalyticsTransport = {
    send: vi.fn(async (events: AnalyticsEvent[]) => {
      sent.push(...events);
      return { ok: true as const };
    }),
    beacon: vi.fn((events: AnalyticsEvent[]) => {
      beaconed.push(...events);
      return true;
    }),
  };
  const onInvalid = vi.fn<(report: InvalidEventReport) => void>();
  const onDrop = vi.fn();
  const client = createAnalyticsClient({
    transport,
    getSessionId: () => "session-1",
    onInvalid,
    onDrop,
    ...overrides,
  });
  /** Calls track() the way untyped or widened code could. */
  const trackUnchecked = (name: string, properties: unknown) =>
    client.track(name as ClientEventName, properties as never);
  return {
    client,
    transport,
    sent,
    beaconed,
    onInvalid,
    onDrop,
    trackUnchecked,
  };
}

describe("runtime validation against the shared catalog", () => {
  it("does not queue or send an event carrying a property outside the catalog", async () => {
    const { client, transport, trackUnchecked, onInvalid } = setup();

    trackUnchecked("trip_viewed", { tripId: "t1", email: "jane@example.com" });

    expect(client.pendingCount()).toBe(0);
    await client.flush();
    client.flushOnUnload();
    expect(transport.send).not.toHaveBeenCalled();
    expect(transport.beacon).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  it("does not strip the extra property and send the rest", async () => {
    const { client, sent, trackUnchecked } = setup();

    trackUnchecked("trip_saved", { tripId: "t1", fullName: "Jane Doe" });
    await client.flush();

    expect(sent).toEqual([]);
  });

  it("reports which event and which path failed, never the offending values", () => {
    const { trackUnchecked, onInvalid } = setup();

    trackUnchecked("trip_viewed", { tripId: "t1", email: "jane@example.com" });

    const [report] = onInvalid.mock.calls[0];
    expect(report.name).toBe("trip_viewed");
    expect(report.issues).toEqual([
      { code: "unrecognized_keys", path: "properties" },
    ]);
    expect(JSON.stringify(report)).not.toContain("jane@example.com");
    expect(JSON.stringify(report)).not.toContain("email");
  });

  it("rejects a property with a value outside the catalog", () => {
    const { client, trackUnchecked, onInvalid } = setup();

    trackUnchecked("wizard_started", { entryPoint: "jane@example.com" });
    trackUnchecked("itinerary_edited", {
      tripId: "t1",
      editType: "reorder",
      dayIndex: -1,
    });

    expect(client.pendingCount()).toBe(0);
    expect(onInvalid.mock.calls.map(([r]) => r.issues[0].path)).toEqual([
      "properties.entryPoint",
      "properties.dayIndex",
    ]);
  });

  it("rejects a missing required property", () => {
    const { client, trackUnchecked, onInvalid } = setup();

    trackUnchecked("trip_viewed", {});

    expect(client.pendingCount()).toBe(0);
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  it("rejects an event name outside the catalog", () => {
    const { client, trackUnchecked, onInvalid } = setup();

    trackUnchecked("user_email_captured", { email: "jane@example.com" });

    expect(client.pendingCount()).toBe(0);
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onInvalid.mock.calls)).not.toContain(
      "jane@example.com",
    );
  });

  it("rejects experiment_exposure, which only the server may write", () => {
    const { client, trackUnchecked, onInvalid } = setup();

    trackUnchecked("experiment_exposure", {
      experimentKey: "new-wizard",
      variant: "treatment",
      bucket: 7,
    });

    expect(client.pendingCount()).toBe(0);
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  it("rejects an envelope the catalog does not accept", () => {
    const { client, onInvalid } = setup({ getSessionId: () => "" });

    client.track("trip_viewed", { tripId: "t1" });

    expect(client.pendingCount()).toBe(0);
    expect(onInvalid.mock.calls[0][0].issues[0].path).toBe("sessionId");
  });

  it("rejects properties that are not a plain JSON object", () => {
    const { client, trackUnchecked, onInvalid } = setup();

    trackUnchecked("trip_viewed", undefined);
    trackUnchecked("trip_viewed", null);
    trackUnchecked("trip_viewed", "jane@example.com");

    expect(client.pendingCount()).toBe(0);
    expect(onInvalid).toHaveBeenCalledTimes(3);
  });

  it("never throws into the caller", () => {
    const { trackUnchecked } = setup({
      onInvalid: () => {
        throw new Error("logger broke");
      },
    });
    const circular: Record<string, unknown> = { tripId: "t1" };
    circular.self = circular;

    expect(() => trackUnchecked("trip_viewed", circular)).not.toThrow();
    expect(() => trackUnchecked("trip_viewed", { tripId: 1n })).not.toThrow();
  });

  it("still sends the valid events tracked around an invalid one", async () => {
    const { client, sent, trackUnchecked, onDrop } = setup();

    client.track("trip_viewed", { tripId: "t1" });
    trackUnchecked("trip_viewed", { tripId: "t2", email: "jane@example.com" });
    client.track("trip_saved", { tripId: "t3" });
    await client.flush();

    expect(sent.map((e) => e.properties)).toEqual([
      { tripId: "t1" },
      { tripId: "t3" },
    ]);
    for (const event of sent) {
      expect(analyticsEventSchema.safeParse(event).success).toBe(true);
    }
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("keeps invalid events out of the unload beacon", () => {
    const { client, beaconed, trackUnchecked } = setup();

    client.track("trip_viewed", { tripId: "t1" });
    trackUnchecked("calendar_synced", {
      tripId: "t1",
      provider: "google",
      ip: "203.0.113.7",
    });
    client.flushOnUnload();

    expect(beaconed.map((e) => e.name)).toEqual(["trip_viewed"]);
    expect(JSON.stringify(beaconed)).not.toContain("203.0.113.7");
  });
});
