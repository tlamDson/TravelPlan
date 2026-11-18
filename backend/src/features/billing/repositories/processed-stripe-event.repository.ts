import ProcessedStripeEvent from "../models/ProcessedStripeEvent";

const DUPLICATE_KEY_ERROR = 11000;

export class ProcessedStripeEventRepository {
  async has(eventId: string): Promise<boolean> {
    return (await ProcessedStripeEvent.exists({ eventId })) !== null;
  }

  /** Idempotent: recording an id that is already stored is not an error. */
  async record(eventId: string): Promise<void> {
    try {
      await ProcessedStripeEvent.create({ eventId });
    } catch (err: any) {
      if (err?.code !== DUPLICATE_KEY_ERROR) throw err;
    }
  }
}

export const processedStripeEventRepository =
  new ProcessedStripeEventRepository();
