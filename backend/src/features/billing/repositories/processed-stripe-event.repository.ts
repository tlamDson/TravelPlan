import ProcessedStripeEvent from "../models/ProcessedStripeEvent";

const DUPLICATE_KEY_ERROR = 11000;

export class ProcessedStripeEventRepository {
  async isProcessed(eventId: string): Promise<boolean> {
    return (await ProcessedStripeEvent.exists({ eventId })) !== null;
  }

  /**
   * Record a successfully handled event. Idempotent: a repeat keeps the first
   * processedAt, and a concurrent upsert losing the unique-index race is fine.
   */
  async markProcessed(eventId: string): Promise<void> {
    try {
      await ProcessedStripeEvent.updateOne(
        { eventId },
        { $setOnInsert: { eventId, processedAt: new Date() } },
        { upsert: true },
      );
    } catch (err: any) {
      if (err?.code !== DUPLICATE_KEY_ERROR) throw err;
    }
  }
}

export const processedStripeEventRepository =
  new ProcessedStripeEventRepository();
