import type { AnalyticsEvent } from "@travelplan/shared";
import { describe, expect, it, vi } from "vitest";
import { createHttpTransport } from "../lib/http-transport";
import { blobText } from "./blob-text";

const URL = "https://api.example.test/api/analytics/events";

const event: AnalyticsEvent = {
  eventId: "00000000-0000-4000-8000-000000000001",
  schemaVersion: 1,
  occurredAt: "2026-11-13T10:00:00.000Z",
  sessionId: "s1",
  userId: null,
  source: "web",
  name: "trip_viewed",
  properties: { tripId: "t1" },
};

function fetchReturning(status: number) {
  return vi.fn(async () => new Response(null, { status }));
}

describe("send()", () => {
  it("POSTs the batch as JSON with credentials", async () => {
    const fetchImpl = fetchReturning(202);
    const transport = createHttpTransport({ url: URL, fetchImpl });

    const result = await transport.send([event]);

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.keepalive).toBe(false);
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(init.body as string)).toEqual({ events: [event] });
  });

  it("passes keepalive through", async () => {
    const fetchImpl = fetchReturning(200);
    const transport = createHttpTransport({ url: URL, fetchImpl });

    await transport.send([event], { keepalive: true });

    const init = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[1].keepalive).toBe(true);
  });

  it("adds a bearer token when the getter returns one", async () => {
    const fetchImpl = fetchReturning(200);
    const transport = createHttpTransport({
      url: URL,
      fetchImpl,
      getToken: async () => "tok_123",
    });

    await transport.send([event]);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer tok_123",
    );
  });

  it("still sends without a token when the getter throws", async () => {
    const fetchImpl = fetchReturning(200);
    const transport = createHttpTransport({
      url: URL,
      fetchImpl,
      getToken: async () => {
        throw new Error("clerk not ready");
      },
    });

    const result = await transport.send([event]);

    expect(result).toEqual({ ok: true });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(new Headers(init.headers).has("authorization")).toBe(false);
  });

  it.each([429, 500, 502, 503])(
    "marks HTTP %i as retryable",
    async (status) => {
      const transport = createHttpTransport({
        url: URL,
        fetchImpl: fetchReturning(status),
      });

      expect(await transport.send([event])).toEqual({
        ok: false,
        retryable: true,
        status,
      });
    },
  );

  it.each([400, 401, 403, 404, 413])(
    "marks HTTP %i as not retryable",
    async (status) => {
      const transport = createHttpTransport({
        url: URL,
        fetchImpl: fetchReturning(status),
      });

      expect(await transport.send([event])).toEqual({
        ok: false,
        retryable: false,
        status,
      });
    },
  );

  it("marks a network error as retryable", async () => {
    const transport = createHttpTransport({
      url: URL,
      fetchImpl: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });

    expect(await transport.send([event])).toEqual({
      ok: false,
      retryable: true,
    });
  });
});

describe("beacon()", () => {
  it("queues the batch as a text/plain JSON blob, which needs no CORS preflight", async () => {
    const sendBeacon = vi.fn(() => true);
    const transport = createHttpTransport({
      url: URL,
      fetchImpl: fetchReturning(200),
      sendBeacon,
    });

    expect(transport.beacon([event])).toBe(true);

    const [url, body] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe(URL);
    expect(body.type).toBe("text/plain;charset=utf-8");
    expect(JSON.parse(await blobText(body))).toEqual({ events: [event] });
  });

  it("returns false when the browser refuses the beacon", () => {
    const transport = createHttpTransport({
      url: URL,
      fetchImpl: fetchReturning(200),
      sendBeacon: vi.fn(() => false),
    });

    expect(transport.beacon([event])).toBe(false);
  });

  it("returns false when sendBeacon throws", () => {
    const transport = createHttpTransport({
      url: URL,
      fetchImpl: fetchReturning(200),
      sendBeacon: vi.fn(() => {
        throw new TypeError("Illegal invocation");
      }),
    });

    expect(transport.beacon([event])).toBe(false);
  });

  it("returns false when sendBeacon is unavailable", () => {
    const transport = createHttpTransport({
      url: URL,
      fetchImpl: fetchReturning(200),
      sendBeacon: null,
    });

    expect(transport.beacon([event])).toBe(false);
  });
});
