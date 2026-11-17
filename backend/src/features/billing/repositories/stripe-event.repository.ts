import StripeEvent from "../models/StripeEvent";

export const stripeEventRepository = {
  async isProcessed(eventId: string): Promise<boolean> {
    return (await StripeEvent.exists({ eventId })) !== null;
  },

  /** Upsert so a concurrent duplicate delivery is a no-op, not a key error. */
  async markProcessed(eventId: string, type: string): Promise<void> {
    await StripeEvent.updateOne(
      { eventId },
      { $setOnInsert: { eventId, type } },
      { upsert: true },
    );
  },
};
