import { createHmac } from "node:crypto";
import { env } from "../../../config/env";

export const ANALYTICS_HASH_SECRET_MIN_LENGTH = 32;

/**
 * Throws unless ANALYTICS_HASH_SECRET is set and long enough. Called when
 * the analytics route is mounted (app.ts), so turning ANALYTICS_ENABLED on
 * without a secret crashes at boot instead of at the first event.
 */
export function assertAnalyticsHashSecret(): string {
  const secret = env.ANALYTICS_HASH_SECRET;
  if (secret.length < ANALYTICS_HASH_SECRET_MIN_LENGTH) {
    throw new Error(
      `ANALYTICS_HASH_SECRET must be at least ${ANALYTICS_HASH_SECRET_MIN_LENGTH} characters when analytics ingest is enabled`,
    );
  }
  return secret;
}

/**
 * Pseudonymous id stored in place of the Clerk userId (CLAUDE.md: PII is
 * hashed before it reaches anything stored for analysis). Keyed HMAC, not a
 * bare SHA-256, so the hash can't be reversed by hashing known Clerk ids.
 * Stable per user, so exposure and metric events still join.
 */
export function hashUserId(userId: string): string {
  return createHmac("sha256", assertAnalyticsHashSecret())
    .update(userId)
    .digest("hex");
}
