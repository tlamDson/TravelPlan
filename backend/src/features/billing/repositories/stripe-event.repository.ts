import StripeEvent from "../models/StripeEvent";

export const stripeEventRepository = {
  async isProcessed(eventId: string): Promise<boolean> {
    return (await StripeEvent.exists({ eventId })) !== null;
  },

  /**
   * Records an event id after its handling succeeded. Idempotent: a
   * concurrent duplicate that also finished is not an error.
   */
  async markProcessed(eventId: string, type: string): Promise<void> {
    try {
      await StripeEvent.updateOne(
        { eventId },
        { $setOnInsert: { eventId, type } },
        { upsert: true },
      );
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  },
};
