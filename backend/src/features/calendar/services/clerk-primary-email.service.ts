/**
 * Fetch Clerk user's primary email via Clerk REST API (server-side).
 * Reused outside the calendar feature too (e.g. reliability-admin-guard.service.ts)
 * — this is generic Clerk glue, not calendar-specific.
 *
 * Testability note: this makes a REAL network call via `axios`, separate
 * from `@clerk/express` — the `clerk-express.stub.ts` alias every
 * integration test gets (via `resolve.alias` in
 * vitest.integration.config.ts) does NOT intercept this. Any integration
 * test exercising a route that (transitively) calls this must `vi.mock()`
 * something upstream of it — either this module directly, or a guard
 * function that calls it (see reliability.integration.test.ts, which
 * mocks `reliability-admin-guard.service.ts` one level up) — or it will
 * silently hit the real Clerk API with the test env's dummy
 * `CLERK_SECRET_KEY` and always fail closed (this function returns
 * `null` on any error).
 */

import axios from "axios";
import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";

const CLERK_API = "https://api.clerk.com/v1";

type ClerkEmailAddress = {
  id: string;
  email_address: string;
};

type ClerkUserResponse = {
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
};

/**
 * Returns lowercased primary email, or first verified email, or null.
 */
export async function getClerkUserPrimaryEmail(
  clerkUserId: string,
): Promise<string | null> {
  try {
    const res = await axios.get<ClerkUserResponse>(
      `${CLERK_API}/users/${clerkUserId}`,
      {
        headers: {
          Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
        },
      },
    );

    const emails = res.data?.email_addresses ?? [];
    if (emails.length === 0) {
      return null;
    }

    const primaryId = res.data?.primary_email_address_id;
    const primary = primaryId
      ? emails.find((e) => e.id === primaryId)
      : undefined;
    const chosen = primary ?? emails[0];
    return chosen?.email_address?.trim().toLowerCase() ?? null;
  } catch (err: unknown) {
    logger.error({ err, clerkUserId }, "Failed to fetch Clerk user email");
    return null;
  }
}
