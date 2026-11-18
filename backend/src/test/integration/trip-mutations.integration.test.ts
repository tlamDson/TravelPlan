import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { asUser, seedTrip } from "../integration-fixtures";
import { TripLifecycleValues } from "@travelplan/shared";

const app = createApp();

describe("DELETE /api/trips/:tripId", () => {
  it("requires authentication", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app).delete(`/api/trips/${trip._id}`);
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown trip", async () => {
    const res = await request(app)
      .delete("/api/trips/000000000000000000000000")
      .set(asUser("owner"));
    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-owner and does not delete the trip", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .delete(`/api/trips/${trip._id}`)
      .set(asUser("someone-else"));
    expect(res.status).toBe(403);

    const still = await request(app)
      .get(`/api/trips/${trip._id}`)
      .set(asUser("owner"));
    expect(still.status).toBe(200);
  });

  it("deletes the trip for its owner", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .delete(`/api/trips/${trip._id}`)
      .set(asUser("owner"));
    expect(res.status).toBe(200);

    const after = await request(app)
      .get(`/api/trips/${trip._id}`)
      .set(asUser("owner"));
    expect(after.status).toBe(404);
  });
});

describe("PATCH /api/trips/:tripId", () => {
  it("returns 400 when the body has no allowed fields", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .patch(`/api/trips/${trip._id}`)
      .set(asUser("owner"))
      .send({ status: "COMPLETED" }); // not in allowedUpdates
    expect(res.status).toBe(400);
  });

  it("strips fields outside the allowlist instead of applying them (mass-assignment guard)", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .patch(`/api/trips/${trip._id}`)
      .set(asUser("owner"))
      .send({ title: "New Title", userId: "hacked" });
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe("owner");
    expect(res.body.data.title).toBe("New Title");
  });

  it("returns 403 for a non-owner", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .patch(`/api/trips/${trip._id}`)
      .set(asUser("someone-else"))
      .send({ title: "Hijacked" });
    expect(res.status).toBe(403);
  });

  it("returns 400 (not 500) for a non-ObjectId tripId", async () => {
    const res = await request(app)
      .patch("/api/trips/not-an-id")
      .set(asUser("owner"))
      .send({ title: "x" });
    expect(res.status).toBe(400);
  });

  it("returns 400 (not 500) when title is an object", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .patch(`/api/trips/${trip._id}`)
      .set(asUser("owner"))
      .send({ title: { a: 1 } });
    expect(res.status).toBe(400);
  });

  it("strips HTML from the title before storing it", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .patch(`/api/trips/${trip._id}`)
      .set(asUser("owner"))
      .send({ title: "  Hello <script>alert(1)</script>World  " });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Hello World");
  });
});

describe("PATCH /api/trips/:tripId/lifecycle", () => {
  it("returns 400 for an invalid lifecycle value", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .patch(`/api/trips/${trip._id}/lifecycle`)
      .set(asUser("owner"))
      .send({ lifecycle: "NOT_A_REAL_STATE" });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it("returns 403 for a non-owner", async () => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .patch(`/api/trips/${trip._id}/lifecycle`)
      .set(asUser("someone-else"))
      .send({ lifecycle: "COMPLETED" });
    expect(res.status).toBe(403);
  });

  it.each(TripLifecycleValues)("accepts lifecycle value %s", async (value) => {
    const trip = await seedTrip("owner");
    const res = await request(app)
      .patch(`/api/trips/${trip._id}/lifecycle`)
      .set(asUser("owner"))
      .send({ lifecycle: value });
    expect(res.status).toBe(200);
    expect(res.body.trip.lifecycle).toBe(value);
  });
});
