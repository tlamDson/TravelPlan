import { describe, it, expect, vi } from "vitest";

vi.mock("./ai-agent.service", () => ({ aiAgentService: {} }));
vi.mock("./validation.service", () => ({ validationService: {} }));

import { recalcDayDistances } from "./activity-regen.service";
import type { IActivity } from "../models/Trip.types";
import Trip from "../models/Trip";

const act = (name: string, coordinates?: number[]): any => ({
  type: "poi",
  name,
  order: 0,
  distanceFromPrevious: 99,
  requiresTransport: true,
  ...(coordinates && { location: { type: "Point", coordinates } }),
});

describe("recalcDayDistances", () => {
  it("computes a finite distance when both activities have coordinates", () => {
    const day = [act("a", [108.2, 16.06]), act("b", [108.22, 16.07])];
    recalcDayDistances(day as IActivity[]);
    expect(Number.isFinite(day[1]!.distanceFromPrevious)).toBe(true);
    expect(day[1]!.distanceFromPrevious).toBeLessThan(5);
    expect(typeof day[1]!.requiresTransport).toBe("boolean");
  });

  it("clears distance fields when the current activity has empty coordinates", () => {
    const day = [act("a", [108.2, 16.06]), act("b", [])];
    recalcDayDistances(day as IActivity[]);
    expect(day[1]!.distanceFromPrevious).toBeUndefined();
    expect(day[1]!.requiresTransport).toBeUndefined();
  });

  it("clears distance fields when the previous activity has empty coordinates", () => {
    const day = [act("a", []), act("b", [108.2, 16.06])];
    recalcDayDistances(day as IActivity[]);
    expect(day[1]!.distanceFromPrevious).toBeUndefined();
    expect(day[1]!.requiresTransport).toBeUndefined();
  });

  it("clears distance fields when a coordinate is not a finite number", () => {
    const day = [act("a", [108.2, 16.06]), act("b", [NaN, 16.06])];
    recalcDayDistances(day as IActivity[]);
    expect(day[1]!.distanceFromPrevious).toBeUndefined();
  });

  it("clears distance fields when coordinates have fewer than two entries", () => {
    const day = [act("a", [108.2, 16.06]), act("b", [108.2])];
    recalcDayDistances(day as IActivity[]);
    expect(day[1]!.distanceFromPrevious).toBeUndefined();
  });

  it("clears stale distance fields on real Mongoose subdocuments", () => {
    const trip = new Trip({
      userId: "u",
      itinerary: [
        {
          day: 1,
          activities: [
            {
              type: "poi",
              name: "a",
              order: 0,
              location: { type: "Point", coordinates: [108.2, 16.06] },
              distanceFromPrevious: 7,
              requiresTransport: true,
            },
            {
              type: "poi",
              name: "b",
              order: 1,
              distanceFromPrevious: 5,
              requiresTransport: true,
            },
          ],
        },
      ],
    } as any);
    const day = trip.itinerary[0]!.activities;
    recalcDayDistances(day as any);
    expect((day[0] as any).distanceFromPrevious).toBeUndefined();
    expect((day[0] as any).requiresTransport).toBeUndefined();
    expect((day[1] as any).distanceFromPrevious).toBeUndefined();
    expect((day[1] as any).requiresTransport).toBeUndefined();
    const plain = (day[1] as any).toObject();
    expect(plain.distanceFromPrevious).toBeUndefined();
    expect(plain.requiresTransport).toBeUndefined();
  });
});
