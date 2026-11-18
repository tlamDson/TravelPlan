import ProcessedStripeEvent from "../models/ProcessedStripeEvent";

const DUPLICATE_KEY_ERROR = 11000;
/** Longer than any handler run; a crashed worker's claim expires after this. */
const CLAIM_LEASE_MS = 60_000;

export type ClaimResult = "claimed" | "duplicate" | "in_flight";

export class ProcessedStripeEventRepository {
  /**
   * Atomically claim an event for processing. The unique index on `eventId`
   * guarantees only one of several simultaneous callers gets "claimed".
   */
  async claim(eventId: string): Promise<ClaimResult> {
    const lockedUntil = new Date(Date.now() + CLAIM_LEASE_MS);
    try {
      await ProcessedStripeEvent.create({
        eventId,
        status: "processing",
        lockedUntil,
      });
      return "claimed";
    } catch (err: any) {
      if (err?.code !== DUPLICATE_KEY_ERROR) throw err;
    }

    // Take over only a claim whose lease expired (the worker crashed).
    const takenOver = await ProcessedStripeEvent.findOneAndUpdate(
      { eventId, status: "processing", lockedUntil: { $lt: new Date() } },
      { lockedUntil },
    );
    if (takenOver) return "claimed";

    const existing = await ProcessedStripeEvent.findOne({ eventId });
    // Released between the failed insert and now: let the caller retry.
    if (!existing) return "in_flight";
    return existing.status === "done" ? "duplicate" : "in_flight";
  }

  /** Handler succeeded: keep the id so replays are ignored until the TTL. */
  async complete(eventId: string): Promise<void> {
    await ProcessedStripeEvent.updateOne({ eventId }, { status: "done" });
  }

  /** Handler failed: free the id so Stripe's retry is processed again. */
  async release(eventId: string): Promise<void> {
    await ProcessedStripeEvent.deleteOne({ eventId, status: "processing" });
  }
}

export const processedStripeEventRepository =
  new ProcessedStripeEventRepository();
