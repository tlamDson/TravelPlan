import {
  ANALYTICS_BATCH_MAX_EVENTS,
  analyticsEventSchema,
  type AnalyticsEvent,
} from "@travelplan/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAnalyticsClient,
  type AnalyticsClientOptions,
  type AnalyticsTransport,
  type SendResult,
} from "../lib/analytics-client";

type SendCall = { events: AnalyticsEvent[]; keepalive: boolean };

function fakeTransport(results: SendResult[] = []) {
  const sends: SendCall[] = [];
  const beacons: AnalyticsEvent[][] = [];
  let beaconAccepts = true;
  const transport: AnalyticsTransport = {
    send: vi.fn(async (events, opts) => {
      sends.push({ events, keepalive: opts?.keepalive ?? false });
      return results.shift() ?? { ok: true };
    }),
    beacon: vi.fn((events) => {
      beacons.push(events);
      return beaconAccepts;
    }),
  };
  return {
    transport,
    sends,
    beacons,
    rejectBeacons: () => {
      beaconAccepts = false;
    },
  };
}

let idCounter = 0;
function sequentialUuid() {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
}

function makeClient(
  transport: AnalyticsTransport,
  overrides: Partial<AnalyticsClientOptions> = {},
) {
  return createAnalyticsClient({
    transport,
    getSessionId: () => "session-1",
    newId: sequentialUuid,
    now: () => new Date("2026-11-13T10:00:00.000Z"),
    batchSize: 3,
    flushIntervalMs: 5_000,
    maxAttempts: 3,
    baseBackoffMs: 1_000,
    maxBackoffMs: 30_000,
    maxQueueSize: 100,
    onDrop: vi.fn(),
    ...overrides,
  });
}

const ids = (events: AnalyticsEvent[]) => events.map((e) => e.eventId);

beforeEach(() => {
  idCounter = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("track() envelope", () => {
  it("builds an event that satisfies the shared analytics contract", async () => {
    const { transport, sends } = fakeTransport();
    const client = makeClient(transport);

    client.track("trip_viewed", { tripId: "trip-42" });
    await client.flush();

    expect(sends).toHaveLength(1);
    const [event] = sends[0].events;
    expect(event).toEqual({
      eventId: "00000000-0000-4000-8000-000000000001",
      schemaVersion: 1,
      occurredAt: "2026-11-13T10:00:00.000Z",
      sessionId: "session-1",
      userId: null,
      source: "web",
      name: "trip_viewed",
      properties: { tripId: "trip-42" },
    });
    expect(analyticsEventSchema.safeParse(event).success).toBe(true);
  });

  it("stamps the identified user on events tracked after identify()", async () => {
    const { transport, sends } = fakeTransport();
    const client = makeClient(transport);

    client.track("wizard_started", { entryPoint: "landing" });
    client.identify("user_abc");
    client.track("wizard_started", { entryPoint: "dashboard" });
    client.identify(null);
    client.track("trip_saved", { tripId: "t1" });
    await client.flush();

    expect(sends[0].events.map((e) => e.userId)).toEqual([
      null,
      "user_abc",
      null,
    ]);
  });
});

describe("batching", () => {
  it("does not send until the batch is full, then sends exactly one full batch", async () => {
    const { transport, sends } = fakeTransport();
    const client = makeClient(transport);

    client.track("trip_viewed", { tripId: "a" });
    client.track("trip_viewed", { tripId: "b" });
    await vi.advanceTimersByTimeAsync(0);
    expect(sends).toHaveLength(0);

    client.track("trip_viewed", { tripId: "c" });
    await vi.advanceTimersByTimeAsync(0);
    expect(sends).toHaveLength(1);
    expect(sends[0].events).toHaveLength(3);
    expect(client.pendingCount()).toBe(0);
  });

  it("flushes a partial batch once the flush interval elapses", async () => {
    const { transport, sends } = fakeTransport();
    const client = makeClient(transport);

    client.track("trip_viewed", { tripId: "a" });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(sends).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(sends).toHaveLength(1);
    expect(sends[0].events).toHaveLength(1);
  });

  it("keeps one request in flight and sends later events in the next batch", async () => {
    let release: (r: SendResult) => void = () => {};
    const sends: AnalyticsEvent[][] = [];
    const transport: AnalyticsTransport = {
      send: vi.fn((events) => {
        sends.push(events);
        return new Promise<SendResult>((resolve) => {
          release = resolve;
        });
      }),
      beacon: vi.fn(() => true),
    };
    const client = makeClient(transport);

    for (const t of ["a", "b", "c", "d", "e", "f"]) {
      client.track("trip_viewed", { tripId: t });
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(sends).toHaveLength(1);

    release({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(sends).toHaveLength(2);
    expect(ids(sends[1])).not.toEqual(expect.arrayContaining(ids(sends[0])));
    expect(sends.flat()).toHaveLength(6);
  });

  it("never sends more than the shared batch maximum", async () => {
    const { transport, sends } = fakeTransport();
    const client = makeClient(transport, { batchSize: 1_000 });

    for (let i = 0; i < ANALYTICS_BATCH_MAX_EVENTS + 5; i += 1) {
      client.track("trip_viewed", { tripId: `t${i}` });
    }
    await vi.advanceTimersByTimeAsync(0);
    await client.flush();

    expect(sends.map((s) => s.events.length)).toEqual([
      ANALYTICS_BATCH_MAX_EVENTS,
      5,
    ]);
  });

  it("drops the oldest events when the queue is full", async () => {
    const onDrop = vi.fn();
    const { transport, sends } = fakeTransport();
    const client = makeClient(transport, {
      batchSize: 10,
      maxQueueSize: 2,
      onDrop,
    });

    client.track("trip_viewed", { tripId: "old" });
    client.track("trip_viewed", { tripId: "mid" });
    client.track("trip_viewed", { tripId: "new" });
    await client.flush();

    expect(
      sends[0].events.map((e) => (e.properties as { tripId: string }).tripId),
    ).toEqual(["mid", "new"]);
    expect(onDrop).toHaveBeenCalledWith(
      [expect.objectContaining({ properties: { tripId: "old" } })],
      "queue_full",
    );
  });
});

describe("retry", () => {
  it("resends the same eventIds after a retryable failure, with backoff", async () => {
    const { transport, sends } = fakeTransport([
      { ok: false, retryable: true },
      { ok: true },
    ]);
    const client = makeClient(transport);

    client.track("trip_viewed", { tripId: "a" });
    client.track("trip_viewed", { tripId: "b" });
    await client.flush();
    expect(sends).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(sends).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sends).toHaveLength(2);
    expect(ids(sends[1].events)).toEqual(ids(sends[0].events));
    expect(sends[1].events).toEqual(sends[0].events);
  });

  it("doubles the backoff on each consecutive failure", async () => {
    const { transport, sends } = fakeTransport([
      { ok: false, retryable: true },
      { ok: false, retryable: true },
      { ok: true },
    ]);
    const client = makeClient(transport);

    client.track("trip_viewed", { tripId: "a" });
    await client.flush();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sends).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(sends).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sends).toHaveLength(3);
  });

  it("treats a transport that throws as a retryable failure", async () => {
    const sends: AnalyticsEvent[][] = [];
    let calls = 0;
    const transport: AnalyticsTransport = {
      send: vi.fn(async (events) => {
        sends.push(events);
        calls += 1;
        if (calls === 1) throw new Error("boom");
        return { ok: true } as const;
      }),
      beacon: vi.fn(() => true),
    };
    const client = makeClient(transport);

    client.track("trip_viewed", { tripId: "a" });
    await client.flush();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(sends).toHaveLength(2);
    expect(ids(sends[1])).toEqual(ids(sends[0]));
  });

  it("does not let a full queue cut the backoff short", async () => {
    const { transport, sends } = fakeTransport([
      { ok: false, retryable: true },
    ]);
    const client = makeClient(transport);

    client.track("trip_viewed", { tripId: "a" });
    await client.flush();
    for (const t of ["b", "c", "d"]) {
      client.track("trip_viewed", { tripId: t });
    }
    await vi.advanceTimersByTimeAsync(500);
    expect(sends).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(ids(sends[1].events)).toEqual(ids(sends[0].events));
  });

  it("drops a batch after maxAttempts retryable failures", async () => {
    const onDrop = vi.fn();
    const { transport, sends } = fakeTransport([
      { ok: false, retryable: true },
      { ok: false, retryable: true },
      { ok: false, retryable: true },
    ]);
    const client = makeClient(transport, { onDrop });

    client.track("trip_viewed", { tripId: "a" });
    await client.flush();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sends).toHaveLength(3);
    expect(onDrop).toHaveBeenCalledWith(sends[0].events, "max_attempts");
    expect(client.pendingCount()).toBe(0);
  });

  it("drops a batch without retrying on a non-retryable failure", async () => {
    const onDrop = vi.fn();
    const { transport, sends } = fakeTransport([
      { ok: false, retryable: false, status: 400 },
    ]);
    const client = makeClient(transport, { onDrop });

    client.track("trip_viewed", { tripId: "a" });
    await client.flush();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sends).toHaveLength(1);
    expect(onDrop).toHaveBeenCalledWith(sends[0].events, "rejected");
  });

  it("resets the attempt counter after a success", async () => {
    const onDrop = vi.fn();
    const { transport, sends } = fakeTransport([
      { ok: false, retryable: true },
      { ok: false, retryable: true },
      { ok: true },
      { ok: false, retryable: true },
      { ok: true },
    ]);
    const client = makeClient(transport, { onDrop });

    client.track("trip_viewed", { tripId: "a" });
    await client.flush();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(sends).toHaveLength(3);

    client.track("trip_viewed", { tripId: "b" });
    await client.flush();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sends).toHaveLength(5);
    expect(onDrop).not.toHaveBeenCalled();
  });
});

describe("flushOnUnload()", () => {
  it("beacons every queued event and empties the queue", () => {
    const { transport, sends, beacons } = fakeTransport();
    const client = makeClient(transport, { batchSize: 10 });

    client.track("trip_viewed", { tripId: "a" });
    client.track("trip_saved", { tripId: "a" });
    client.flushOnUnload();

    expect(beacons).toHaveLength(1);
    expect(beacons[0].map((e) => e.name)).toEqual([
      "trip_viewed",
      "trip_saved",
    ]);
    expect(sends).toHaveLength(0);
    expect(client.pendingCount()).toBe(0);
  });

  it("beacons a batch waiting for retry with its original eventIds", async () => {
    const { transport, sends, beacons } = fakeTransport([
      { ok: false, retryable: true },
    ]);
    const client = makeClient(transport);

    client.track("trip_viewed", { tripId: "a" });
    await client.flush();
    client.track("trip_viewed", { tripId: "b" });
    client.flushOnUnload();

    expect(ids(beacons[0])).toEqual([
      ...ids(sends[0].events),
      "00000000-0000-4000-8000-000000000002",
    ]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sends).toHaveLength(1);
  });

  it("also beacons the batch still in flight, since the server dedupes by eventId", async () => {
    const sends: AnalyticsEvent[][] = [];
    const beacons: AnalyticsEvent[][] = [];
    const transport: AnalyticsTransport = {
      send: vi.fn((events) => {
        sends.push(events);
        return new Promise<SendResult>(() => {});
      }),
      beacon: vi.fn((events) => {
        beacons.push(events);
        return true;
      }),
    };
    const client = makeClient(transport);

    client.track("trip_viewed", { tripId: "a" });
    void client.flush();
    client.flushOnUnload();

    expect(ids(beacons[0])).toEqual(ids(sends[0]));
  });

  it("splits the beacon payload into chunks of the shared batch maximum", () => {
    const { transport, beacons } = fakeTransport();
    const client = makeClient(transport, { batchSize: 1_000 });

    for (let i = 0; i < ANALYTICS_BATCH_MAX_EVENTS + 1; i += 1) {
      client.track("trip_viewed", { tripId: `t${i}` });
    }
    client.flushOnUnload();

    expect(beacons.map((b) => b.length)).toEqual([
      ANALYTICS_BATCH_MAX_EVENTS,
      1,
    ]);
  });

  it("falls back to a keepalive send when the browser refuses the beacon", () => {
    const { transport, sends, rejectBeacons } = fakeTransport();
    rejectBeacons();
    const client = makeClient(transport, { batchSize: 10 });

    client.track("trip_viewed", { tripId: "a" });
    client.flushOnUnload();

    expect(sends).toHaveLength(1);
    expect(sends[0].keepalive).toBe(true);
    expect(sends[0].events).toHaveLength(1);
  });

  it("does nothing when there is nothing to send", () => {
    const { transport } = fakeTransport();
    const client = makeClient(transport);

    client.flushOnUnload();

    expect(transport.beacon).not.toHaveBeenCalled();
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("cancels the pending interval flush", async () => {
    const { transport, sends } = fakeTransport();
    const client = makeClient(transport);

    client.track("trip_viewed", { tripId: "a" });
    client.flushOnUnload();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(sends).toHaveLength(0);
  });
});
