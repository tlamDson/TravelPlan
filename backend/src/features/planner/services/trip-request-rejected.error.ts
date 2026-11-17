/**
 * Thrown by `createTripGenerationJob` when a request is rejected by a check
 * that runs before any write (duration, budget, tier day cap). Callers may
 * treat it as "nothing happened" — e.g. free an idempotency reservation.
 * Any other error may have left a trip or a queued job behind.
 */
export class TripRequestRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TripRequestRejectedError";
  }
}
