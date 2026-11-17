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
