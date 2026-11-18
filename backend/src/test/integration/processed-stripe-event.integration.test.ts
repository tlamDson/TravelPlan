import { describe, it, expect, beforeAll } from "vitest";
import ProcessedStripeEvent from "../../features/billing/models/ProcessedStripeEvent";
import { processedStripeEventRepository as repo } from "../../features/billing/repositories/processed-stripe-event.repository";

describe("processedStripeEventRepository (real Mongo)", () => {
  beforeAll(async () => {
    await ProcessedStripeEvent.init();
  });

  it("is not processed until marked, then is", async () => {
    expect(await repo.isProcessed("evt_a")).toBe(false);
    await repo.markProcessed("evt_a");
    expect(await repo.isProcessed("evt_a")).toBe(true);
  });

  it("stores one record and keeps the first processedAt when marked repeatedly or concurrently", async () => {
    await Promise.all(
      Array.from({ length: 5 }, () => repo.markProcessed("evt_race")),
    );
    const first = await ProcessedStripeEvent.findOne({ eventId: "evt_race" });
    await repo.markProcessed("evt_race");

    const docs = await ProcessedStripeEvent.find({ eventId: "evt_race" });
    expect(docs).toHaveLength(1);
    expect(docs[0].processedAt).toBeInstanceOf(Date);
    expect(docs[0].processedAt.getTime()).toBe(first?.processedAt.getTime());
  });
});
