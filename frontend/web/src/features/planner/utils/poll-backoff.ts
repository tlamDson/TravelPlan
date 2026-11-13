/**
 * Job status polling backoff: fast first polls so QUEUED → PROCESSING shows
 * up quickly, then slower ones so a long generation does not burn the API
 * rate limit (~1s, 1.5s, 2.25s, 3.4s, 5s, 5s, ...).
 */
export const POLL_INITIAL_INTERVAL_MS = 1000;
export const POLL_MAX_INTERVAL_MS = 5000;
const POLL_BACKOFF_FACTOR = 1.5;

/** Delay before the next poll, given how many polls already completed. */
export function getPollDelay(
  attempt: number,
  initial = POLL_INITIAL_INTERVAL_MS,
  max = POLL_MAX_INTERVAL_MS,
): number {
  return Math.min(Math.round(initial * POLL_BACKOFF_FACTOR ** attempt), max);
}
