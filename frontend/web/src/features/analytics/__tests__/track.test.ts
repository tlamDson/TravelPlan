import { analyticsEventSchema } from "@travelplan/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "@/config/env";
import {
  getAnalyticsSessionId,
  identify,
  resetAnalyticsForTests,
  track,
  trackOnce,
} from "../track";
import { blobText } from "./blob-text";

const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);

beforeEach(() => {
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: sendBeacon,
  });
});

afterEach(() => {
  resetAnalyticsForTests();
  sendBeacon.mockClear();
  sessionStorage.clear();
});

async function beaconBody(call = 0) {
  const [url, blob] = sendBeacon.mock.calls[call];
  return { url, body: JSON.parse(await blobText(blob)) };
}

describe("track()", () => {
  it("beacons tracked events to the ingest endpoint when the page hides", async () => {
    track("wizard_started", { entryPoint: "dashboard" });

    window.dispatchEvent(new Event("pagehide"));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const { url, body } = await beaconBody();
    expect(url).toBe(`${API_URL}/analytics/events`);
    expect(body.events).toHaveLength(1);
    expect(analyticsEventSchema.parse(body.events[0])).toMatchObject({
      name: "wizard_started",
      source: "web",
      userId: null,
      properties: { entryPoint: "dashboard" },
    });
  });

  it("uses one session id per tab and the identified user", async () => {
    track("trip_viewed", { tripId: "t1" });
    identify("user_1");
    track("trip_saved", { tripId: "t1" });

    window.dispatchEvent(new Event("pagehide"));

    const { body } = await beaconBody();
    const [first, second] = body.events;
    expect(first.sessionId).toBe(second.sessionId);
    expect(first.eventId).not.toBe(second.eventId);
    expect([first.userId, second.userId]).toEqual([null, "user_1"]);
  });

  it("sends nothing for an event carrying a property outside the catalog", () => {
    const widened = { tripId: "t1", email: "jane@example.com" };
    track("trip_viewed", widened);

    window.dispatchEvent(new Event("pagehide"));

    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("does not listen for page hide before anything is tracked", () => {
    window.dispatchEvent(new Event("pagehide"));

    expect(sendBeacon).not.toHaveBeenCalled();
  });
});

describe("trackOnce()", () => {
  it("sends one event per key for the life of the page", async () => {
    const props = {
      jobId: "job-1",
      tripId: "t1",
      outcome: "completed",
      durationMs: 1200,
    } as const;
    trackOnce("trip_generation_completed", props, "job-1");
    trackOnce("trip_generation_completed", props, "job-1");
    trackOnce(
      "trip_generation_completed",
      { ...props, jobId: "job-2" },
      "job-2",
    );

    window.dispatchEvent(new Event("pagehide"));

    const { body } = await beaconBody();
    expect(
      body.events.map(
        (e: { properties: { jobId: string } }) => e.properties.jobId,
      ),
    ).toEqual(["job-1", "job-2"]);
  });

  it("keeps the same key apart for different event names", async () => {
    trackOnce("trip_viewed", { tripId: "t1" }, "t1");
    trackOnce("trip_saved", { tripId: "t1" }, "t1");

    window.dispatchEvent(new Event("pagehide"));

    const { body } = await beaconBody();
    expect(body.events.map((e: { name: string }) => e.name)).toEqual([
      "trip_viewed",
      "trip_saved",
    ]);
  });

  it("forgets its keys on reset, like a fresh page load", async () => {
    trackOnce("trip_viewed", { tripId: "t1" }, "t1");
    resetAnalyticsForTests();
    trackOnce("trip_viewed", { tripId: "t1" }, "t1");

    window.dispatchEvent(new Event("pagehide"));

    const { body } = await beaconBody();
    expect(body.events).toHaveLength(1);
  });
});

describe("getAnalyticsSessionId()", () => {
  it("returns the session id that tracked events carry", async () => {
    track("trip_viewed", { tripId: "t1" });
    window.dispatchEvent(new Event("pagehide"));

    const { body } = await beaconBody();
    expect(getAnalyticsSessionId()).toBe(body.events[0].sessionId);
  });
});
