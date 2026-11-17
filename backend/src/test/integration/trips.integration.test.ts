import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { validTripPreferences, asUser } from "../integration-fixtures";

const app = createApp();

describe("POST /api/trips", () => {
  it("requires authentication", async () => {
    const res = await request(app)
      .post("/api/trips")
      .send({ preferences: validTripPreferences() });
    expect(res.status).toBe(401);
  });

  it("rejects invalid preferences with 400", async () => {
    const res = await request(app)
      .post("/api/trips")
      .set(asUser("user-1"))
      .send({ preferences: { destination: "D" } }); // fails min(2), missing dates/budget
    expect(res.status).toBe(400);
  });

  it("rejects a budget below $20/day/person", async () => {
    const res = await request(app)
      .post("/api/trips")
      .set(asUser("user-1"))
      .send({
        preferences: validTripPreferences({
          budget: { total: 5, currency: "USD" },
        }),
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/day/i);
  });

  it("queues a trip and returns 202 with jobId + tripId", async () => {
    const res = await request(app)
      .post("/api/trips")
      .set(asUser("user-1"))
      .send({ preferences: validTripPreferences() });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.jobId).toBe("string");
    expect(typeof res.body.tripId).toBe("string");
  });

  it("is idempotent: the same X-Idempotency-Key returns the same tripId without creating a second trip", async () => {
    const key = "11111111-1111-4111-8111-111111111111";
    const first = await request(app)
      .post("/api/trips")
      .set(asUser("user-1"))
      .set("X-Idempotency-Key", key)
      .send({ preferences: validTripPreferences() });
    expect(first.status).toBe(202);

    const second = await request(app)
      .post("/api/trips")
      .set(asUser("user-1"))
      .set("X-Idempotency-Key", key)
      .send({ preferences: validTripPreferences() });

    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
    expect(second.body.tripId).toBe(first.body.tripId);

    const list = await request(app).get("/api/trips").set(asUser("user-1"));
    expect(list.body.trips).toHaveLength(1);
  });

  it("creates one trip when two requests with the same X-Idempotency-Key arrive in parallel", async () => {
    const key = "22222222-2222-4222-8222-222222222222";
    const send = () =>
      request(app)
        .post("/api/trips")
        .set(asUser("user-1"))
        .set("X-Idempotency-Key", key)
        .send({ preferences: validTripPreferences() });

    const responses = await Promise.all([send(), send()]);
    const statuses = responses.map((r) => r.status);
    const winners = statuses.filter((s) => s === 202);
    const loser = statuses.find((s) => s !== 202);
    expect(winners).toHaveLength(1);
    expect([200, 409]).toContain(loser);

    const list = await request(app).get("/api/trips").set(asUser("user-1"));
    expect(list.body.trips).toHaveLength(1);
  });

  it("scopes a key to its user: another user reusing it still gets idempotency", async () => {
    const key = "33333333-3333-4333-8333-333333333333";
    const post = (userId: string) =>
      request(app)
        .post("/api/trips")
        .set(asUser(userId))
        .set("X-Idempotency-Key", key)
        .send({ preferences: validTripPreferences() });

    expect((await post("user-a")).status).toBe(202);
    const firstB = await post("user-b");
    expect(firstB.status).toBe(202);

    const repeatB = await post("user-b");
    expect(repeatB.status).toBe(200);
    expect(repeatB.body.tripId).toBe(firstB.body.tripId);

    const list = await request(app).get("/api/trips").set(asUser("user-b"));
    expect(list.body.trips).toHaveLength(1);
  });
});

describe("GET /api/trips/:tripId", () => {
  it("returns 403 when the trip belongs to a different user", async () => {
    const created = await request(app)
      .post("/api/trips")
      .set(asUser("owner"))
      .send({ preferences: validTripPreferences() });

    const res = await request(app)
      .get(`/api/trips/${created.body.tripId}`)
      .set(asUser("someone-else"));
    expect(res.status).toBe(403);
  });

  it("returns the trip with status QUEUED for its owner", async () => {
    const created = await request(app)
      .post("/api/trips")
      .set(asUser("owner"))
      .send({ preferences: validTripPreferences() });

    const res = await request(app)
      .get(`/api/trips/${created.body.tripId}`)
      .set(asUser("owner"));
    expect(res.status).toBe(200);
    expect(res.body.trip.status).toBe("QUEUED");
  });
});

describe("GET /api/trips", () => {
  it("filters by status and limit query params", async () => {
    await request(app)
      .post("/api/trips")
      .set(asUser("owner"))
      .send({ preferences: validTripPreferences() });

    const res = await request(app)
      .get("/api/trips?status=QUEUED&limit=5")
      .set(asUser("owner"));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.trips)).toBe(true);
    expect(res.body.trips.length).toBeGreaterThanOrEqual(1);
  });
});
