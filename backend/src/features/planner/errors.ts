/**
 * A trip request the user can fix (duration, budget or tier limit).
 * Controllers map it to 400; any other error is a server fault (500).
 */
export class TripRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TripRequestError";
  }
}

/**
 * The job is already on the queue but a later step failed. Callers must not
 * treat the request as retryable-from-scratch: a retry would enqueue twice.
 */
export class JobEnqueuedError extends Error {
  readonly tripId: string;
  readonly jobId: string;

  constructor(message: string, ids: { tripId: string; jobId: string }) {
    super(message);
    this.name = "JobEnqueuedError";
    this.tripId = ids.tripId;
    this.jobId = ids.jobId;
  }
}
