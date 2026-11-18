import { logger } from "./logger";

/** Delays (ms) between attempts after the first one fails. */
export const BACKGROUND_RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 120_000];

/**
 * Run `task` now; if it fails, keep retrying it on a timer without blocking
 * the caller. Resolves after the first attempt, whatever its outcome.
 */
export async function retryInBackground(
  task: () => Promise<unknown>,
  label: string,
  delays: readonly number[] = BACKGROUND_RETRY_DELAYS_MS,
): Promise<void> {
  const attempt = async (n: number): Promise<void> => {
    try {
      await task();
    } catch (err) {
      if (n >= delays.length) {
        logger.error({ err, attempts: n + 1 }, `${label} gave up`);
        return;
      }
      logger.warn({ err, attempt: n + 1 }, `${label} failed, retrying`);
      const timer = setTimeout(() => void attempt(n + 1), delays[n]);
      timer.unref?.();
    }
  };
  await attempt(0);
}
