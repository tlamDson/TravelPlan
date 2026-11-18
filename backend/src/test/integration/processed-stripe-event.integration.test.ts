import { describe, it, expect, beforeAll } from "vitest";
import ProcessedStripeEvent from "../../features/billing/models/ProcessedStripeEvent";
import { processedStripeEventRepository as repo } from "../../features/billing/repositories/processed-stripe-event.repository";

describe("processedStripeEventRepository (real Mongo)", () => {
  beforeAll(async () => {
    await ProcessedStripeEvent.init();
  });

  it("lets exactly one of several simultaneous claims win", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => repo.claim("evt_race")),
    );

    expect(results.filter((r) => r === "claimed")).toHaveLength(1);
    expect(results.filter((r) => r === "in_flight")).toHaveLength(4);
  });

  it("reports duplicate once completed and claimable again once released", async () => {
    expect(await repo.claim("evt_a")).toBe("claimed");
    await repo.complete("evt_a");
    expect(await repo.claim("evt_a")).toBe("duplicate");

    expect(await repo.claim("evt_b")).toBe("claimed");
    await repo.release("evt_b");
    expect(await repo.claim("evt_b")).toBe("claimed");
  });

  it("lets a new delivery take over a claim whose lease expired (crashed worker)", async () => {
    expect(await repo.claim("evt_crash")).toBe("claimed");
    await ProcessedStripeEvent.updateOne(
      { eventId: "evt_crash" },
      { lockedUntil: new Date(Date.now() - 1000) },
    );

    expect(await repo.claim("evt_crash")).toBe("claimed");
  });
});
