import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ createBrowserLogger: () => logger }));

import { identify, resetAnalyticsForTests, track, trackOnce } from "../track";

const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);
const fetchSpy = vi.fn<typeof fetch>();

beforeEach(() => {
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: sendBeacon,
  });
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  resetAnalyticsForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sendBeacon.mockClear();
  fetchSpy.mockReset();
  Object.values(logger).forEach((fn) => fn.mockClear());
  sessionStorage.clear();
});

describe("analytics flag off (the default)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ANALYTICS_ENABLED", "");
  });

  it("sends no request and no beacon for tracked events", async () => {
    vi.useFakeTimers();
    track("trip_viewed", { tripId: "t1" });
    trackOnce("trip_saved", { tripId: "t1" }, "t1");
    identify("user_1");

    await vi.advanceTimersByTimeAsync(60_000);
    window.dispatchEvent(new Event("pagehide"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});

describe("analytics flag on", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ANALYTICS_ENABLED", "true");
  });

  it("logs an event that fails the catalog at debug level, as a readable string", () => {
    track("trip_viewed", { tripId: "t1", email: "jane@example.com" } as never);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledTimes(1);
    const args = logger.debug.mock.calls[0];
    expect(args).toHaveLength(1);
    expect(typeof args[0]).toBe("string");
    expect(args[0]).toContain("trip_viewed");
    expect(args[0]).not.toContain("[object Object]");
    expect(args[0]).not.toContain("jane@example.com");
  });

  it("logs a dropped batch (server rejects it) at debug level only", async () => {
    vi.useFakeTimers();
    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));

    track("trip_viewed", { tripId: "t1" });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledTimes(1);
    const [message] = logger.debug.mock.calls[0];
    expect(typeof message).toBe("string");
    expect(message).toContain("rejected");
    expect(message).not.toContain("[object Object]");
  });
});
