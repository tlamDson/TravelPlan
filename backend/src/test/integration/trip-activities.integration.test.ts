import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { asUser, seedTrip, seedUser } from "../integration-fixtures";

// activity-regen.service and validation.service both eventually call
// Gemini/Google Places. Mocking them here makes "no integration test may
// call an AI/Places API" a structural guarantee rather than an accident of
// which branches happen to short-circuit first.
vi.mock(
  "../../features/planner/services/activity-regen.service",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../features/planner/services/activity-regen.service")
      >();
    return {
      ...actual,
      activityRegenService: { regenOne: vi.fn() },
    };
  },
);
vi.mock(
  "../../features/planner/services/validation.service",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../features/planner/services/validation.service")
      >();
    return {
      ...actual,
      validationService: { validateIntent: vi.fn() },
    };
  },
);

import { activityRegenService } from "../../features/planner/services/activity-regen.service";
import { validationService } from "../../features/planner/services/validation.service";

const app = createApp();
const mockedRegenOne = vi.mocked(activityRegenService.regenOne);
const mockedValidateIntent = vi.mocked(validationService.validateIntent);

// IActivity (Trip.types.ts) doesn't declare `_id`, even though ActivitySchema
// sets `{ _id: true }` so every activity subdocument has one at runtime —
// the same schema/type drift trip.controller.ts works around with `as any`.
function idOf(activity: unknown): string {
  return (activity as { _id: { toString(): string } })._id.toString();
}

beforeEach(() => {
  mockedRegenOne.mockReset();
  mockedValidateIntent.mockReset();
});

describe("PATCH /api/trips/:tripId/reorder-activities", () => {
  it("returns 400 when dayIndex/orderedActivityIds are malformed", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .patch(`/api/trips/${trip._id}/reorder-activities`)
      .set(asUser("owner"))
      .send({ dayIndex: "not-a-number", orderedActivityIds: [] });
    expect(res.status).toBe(400);
  });

  it("returns 403 for a non-owner", async () => {
    const trip = await seedTrip("owner");
    const ids = trip.itinerary[0]!.activities.map(idOf);
    const res = await request(app)
      .patch(`/api/trips/${trip._id}/reorder-activities`)
      .set(asUser("someone-else"))
      .send({ dayIndex: 0, orderedActivityIds: ids });
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown trip", async () => {
    const res = await request(app)
      .patch("/api/trips/000000000000000000000000/reorder-activities")
      .set(asUser("owner"))
      .send({ dayIndex: 0, orderedActivityIds: ["000000000000000000000000"] });
    expect(res.status).toBe(404);
  });

  it("returns 409 while the trip is locked by the AI agent", async () => {
    const trip = await seedTrip("owner", { isAgentProcessing: true });
    const ids = trip.itinerary[0]!.activities.map(idOf);
    const res = await request(app)
      .patch(`/api/trips/${trip._id}/reorder-activities`)
      .set(asUser("owner"))
      .send({ dayIndex: 0, orderedActivityIds: ids });
    expect(res.status).toBe(409);
  });

  it("returns 400 and leaves the day untouched when ids are a strict subset", async () => {
    const trip = await seedTrip("owner");
    const [a] = trip.itinerary[0]!.activities;

    const res = await request(app)
      .patch(`/api/trips/${trip._id}/reorder-activities`)
      .set(asUser("owner"))
      .send({ dayIndex: 0, orderedActivityIds: [idOf(a)] });

    expect(res.status).toBe(400);
  });

  it("returns 400 when an id is repeated (would duplicate an activity)", async () => {
    const trip = await seedTrip("owner");
    const [a] = trip.itinerary[0]!.activities;

    const res = await request(app)
      .patch(`/api/trips/${trip._id}/reorder-activities`)
      .set(asUser("owner"))
      .send({ dayIndex: 0, orderedActivityIds: [idOf(a), idOf(a)] });

    expect(res.status).toBe(400);
  });

  it("persists the new activity order", async () => {
    const trip = await seedTrip("owner");
    const [a, b] = trip.itinerary[0]!.activities;
    const reversed = [idOf(b), idOf(a)];

    const res = await request(app)
      .patch(`/api/trips/${trip._id}/reorder-activities`)
      .set(asUser("owner"))
      .send({ dayIndex: 0, orderedActivityIds: reversed });

    expect(res.status).toBe(200);
    const names = res.body.itinerary[0].activities.map((x: any) => x.name);
    expect(names).toEqual(["Dragon Bridge", "Marble Mountains"]);
  });
});

describe("POST /api/trips/:tripId/regen-activity", () => {
  it("returns 400 when dayIndex/activityId are malformed", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .post(`/api/trips/${trip._id}/regen-activity`)
      .set(asUser("owner"))
      .send({ dayIndex: "0" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the activityId does not exist in that day", async () => {
    await seedUser("owner");
    const trip = await seedTrip("owner");
    const res = await request(app)
      .post(`/api/trips/${trip._id}/regen-activity`)
      .set(asUser("owner"))
      .send({ dayIndex: 0, activityId: "000000000000000000000000" });
    expect(res.status).toBe(404);
  });

  it("blocks a free user at the 5-regeneration cap before calling the AI", async () => {
    await seedUser("owner", { tier: "free" });
    const trip = await seedTrip("owner", { regenCount: 5 });
    const activityId = idOf(trip.itinerary[0]!.activities[0]!);

    const res = await request(app)
      .post(`/api/trips/${trip._id}/regen-activity`)
      .set(asUser("owner"))
      .send({ dayIndex: 0, activityId });

    expect(res.status).toBe(402);
    expect(mockedRegenOne).not.toHaveBeenCalled();
  });

  it("regenerates an activity for a user under the cap", async () => {
    await seedUser("owner", { tier: "free" });
    const trip = await seedTrip("owner", { regenCount: 0 });
    const activityId = idOf(trip.itinerary[0]!.activities[0]!);
    // Mirrors the real activityRegenService.regenOne(): whenever
    // validationService finds coordinates, it always attaches `location` —
    // see the [BUG] case below for what happens when a replacement omits it.
    mockedRegenOne.mockResolvedValueOnce({
      type: "poi",
      name: "Regenerated Place",
      order: 0,
      location: { type: "Point", coordinates: [108.22, 16.06] },
    } as any);

    const res = await request(app)
      .post(`/api/trips/${trip._id}/regen-activity`)
      .set(asUser("owner"))
      .send({ dayIndex: 0, activityId });

    expect(res.status).toBe(200);
    expect(res.body.activity.name).toBe("Regenerated Place");
    expect(mockedRegenOne).toHaveBeenCalledTimes(1);
  });

  it("saves successfully (and clears distance fields) when the replacement has no location", async () => {
    await seedUser("owner", { tier: "free" });
    const trip = await seedTrip("owner", { regenCount: 0 });
    const activityId = idOf(trip.itinerary[0]!.activities[0]!);
    mockedRegenOne.mockResolvedValueOnce({
      type: "poi",
      name: "No Coordinates Place",
      order: 0,
    } as any);

    const res = await request(app)
      .post(`/api/trips/${trip._id}/regen-activity`)
      .set(asUser("owner"))
      .send({ dayIndex: 0, activityId });

    expect(res.status).toBe(200);
    expect(res.body.activity.name).toBe("No Coordinates Place");
  });
});

describe("POST /api/trips/:tripId/regeocode", () => {
  it("returns 401 without auth", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app).post(`/api/trips/${trip._id}/regeocode`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-owner", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .post(`/api/trips/${trip._id}/regeocode`)
      .set(asUser("someone-else"));
    expect(res.status).toBe(403);
  });

  it("makes zero validation calls and reports 0 updates on an empty itinerary", async () => {
    const trip = await seedTrip("owner", { itinerary: [] });
    const res = await request(app)
      .post(`/api/trips/${trip._id}/regeocode`)
      .set(asUser("owner"));

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(0);
    expect(res.body.failed).toBe(0);
    expect(mockedValidateIntent).not.toHaveBeenCalled();
  });
});
