import StripeEvent from "../models/StripeEvent";

export const stripeEventRepository = {
  /**
   * Atomically claims an event id: true for the first caller, false when
   * the id is already claimed (redelivery or a concurrent duplicate). The
   * unique index on eventId makes the upsert race-safe.
   */
  async claim(eventId: string, type: string): Promise<boolean> {
    try {
      const result = await StripeEvent.updateOne(
        { eventId },
        { $setOnInsert: { eventId, type } },
        { upsert: true },
      );
      return result.upsertedCount === 1;
    } catch (err) {
      // Two concurrent upserts of one id: the loser gets a duplicate key.
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  },

  /** Drops a claim so Stripe's retry of a failed event is processed. */
  async release(eventId: string): Promise<void> {
    await StripeEvent.deleteOne({ eventId });
  },
};
