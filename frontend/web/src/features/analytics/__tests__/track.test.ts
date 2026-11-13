import { analyticsEventSchema } from "@travelplan/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "@/config/env";
import { identify, resetAnalyticsForTests, track } from "../track";

const sendBeacon = vi.fn((_url: string, _body: Blob) => true);

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
  return { url, body: JSON.parse(await blob.text()) };
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

  it("does not listen for page hide before anything is tracked", () => {
    window.dispatchEvent(new Event("pagehide"));

    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
