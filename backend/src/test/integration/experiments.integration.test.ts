import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// Mocked rather than set through process.env: config/env.ts may already be
// evaluated by an earlier file in this worker (see
// reliability.integration.test.ts for the full story).
vi.mock("../../features/experiments/experiments-flag", () => ({
  isExperimentsEnabled: () => true,
}));

import request from "supertest";
import { createApp } from "../../app";
import { asUser } from "../integration-fixtures";
import Experiment from "../../features/experiments/models/Experiment";
import AnalyticsEvent from "../../features/analytics/models/AnalyticsEvent";
import { hashUserId } from "../../features/analytics/services/pseudonymize";

const app = createApp();
const ASSIGNMENTS = "/api/experiments/assignments";
const EXPOSURES = "/api/experiments/exposures";

const variants = [
  { key: "control", weight: 5000 },
  { key: "treatment", weight: 5000 },
];

async function seedExperiments() {
  await Experiment.create([
    // user_1 → bucket 5026 (treatment), user_2 → 4710 (control);
    // values from Python hashlib, see assignment.test.ts.
    {
      key: "vector-ab",
      salt: "s1",
      status: "running",
      holdoutBuckets: 0,
      variants,
    },
    {
      key: "draft-v1",
      salt: "d",
      status: "draft",
      holdoutBuckets: 0,
      variants,
    },
    {
      key: "stopped-v1",
      salt: "t",
      status: "stopped",
      holdoutBuckets: 0,
      variants,
    },
  ]);
}

describe("/api/experiments — flag on", () => {
  beforeAll(async () => {
    await Experiment.init();
    await AnalyticsEvent.init();
  });

  beforeEach(seedExperiments);

  describe("GET /assignments", () => {
    it("401s without a session", async () => {
      const res = await request(app).get(ASSIGNMENTS);
      expect(res.status).toBe(401);
    });

    it("assigns the session user in running experiments only", async () => {
      const res = await request(app).get(ASSIGNMENTS).set(asUser("user_1"));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        assignments: [{ experimentKey: "vector-ab", variant: "treatment" }],
      });

      const other = await request(app).get(ASSIGNMENTS).set(asUser("user_2"));
      expect(other.body.assignments).toEqual([
        { experimentKey: "vector-ab", variant: "control" },
      ]);
    });

    it("gives the same user the same variant on every call", async () => {
      const a = await request(app).get(ASSIGNMENTS).set(asUser("user_1"));
      const b = await request(app).get(ASSIGNMENTS).set(asUser("user_1"));
      expect(b.body).toEqual(a.body);
    });
  });

  describe("POST /exposures", () => {
    const body = { experimentKey: "vector-ab", sessionId: "sess-1" };

    it("401s without a session and stores nothing", async () => {
      const res = await request(app).post(EXPOSURES).send(body);
      expect(res.status).toBe(401);
      expect(await AnalyticsEvent.countDocuments()).toBe(0);
    });

    it("stores one server exposure with the server's variant and hashed userId", async () => {
      const res = await request(app)
        .post(EXPOSURES)
        .set(asUser("user_2"))
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        experimentKey: "vector-ab",
        variant: "control",
        recorded: true,
      });

      const stored = await AnalyticsEvent.find().lean();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        name: "experiment_exposure",
        source: "server",
        userId: hashUserId("user_2"),
        properties: {
          experimentKey: "vector-ab",
          variant: "control",
          bucket: 4710,
        },
      });
      expect(stored[0]!.sessionId).not.toBe("sess-1");
    });

    it("logs once per session: a repeat is recorded:false, a new session is a new exposure", async () => {
      const send = (sessionId: string) =>
        request(app)
          .post(EXPOSURES)
          .set(asUser("user_1"))
          .send({ experimentKey: "vector-ab", sessionId });

      expect((await send("sess-1")).body.recorded).toBe(true);
      const repeat = await send("sess-1");
      expect(repeat.status).toBe(200);
      expect(repeat.body).toEqual({
        experimentKey: "vector-ab",
        variant: "treatment",
        recorded: false,
      });
      expect(await AnalyticsEvent.countDocuments()).toBe(1);

      expect((await send("sess-2")).body.recorded).toBe(true);
      expect(await AnalyticsEvent.countDocuments()).toBe(2);
    });

    it("404s for draft, stopped and unknown experiments", async () => {
      for (const experimentKey of ["draft-v1", "stopped-v1", "nope-v1"]) {
        const res = await request(app)
          .post(EXPOSURES)
          .set(asUser("user_1"))
          .send({ experimentKey, sessionId: "s" });
        expect(res.status).toBe(404);
      }
      expect(await AnalyticsEvent.countDocuments()).toBe(0);
    });

    it("400s when the client tries to pick its own variant", async () => {
      const res = await request(app)
        .post(EXPOSURES)
        .set(asUser("user_1"))
        .send({ ...body, variant: "control" });
      expect(res.status).toBe(400);
      expect(await AnalyticsEvent.countDocuments()).toBe(0);
    });
  });

  it("rejects a second experiment with the same key (unique index)", async () => {
    await expect(
      Experiment.create({
        key: "vector-ab",
        salt: "other",
        status: "draft",
        holdoutBuckets: 0,
        variants,
      }),
    ).rejects.toThrow(/duplicate key/);
  });
});
