import type { AnalyticsEvent } from "@travelplan/shared";
import type { QuarantineIssue, QuarantineReason } from "./quarantine-reason";

/**
 * Rules for events arriving over the public HTTP endpoint, on top of the
 * schema. The schema says what an event looks like; this says what a
 * browser is allowed to claim:
 * - `source: "server"` (experiment exposure) is written by the server
 *   only, through ingestTrustedEvents — never accepted from a client.
 * - a non-null `userId` must be the Clerk session's user. Anonymous
 *   (null) events are fine from anyone, signed in or not.
 */
export function clientPolicyViolation(
  event: AnalyticsEvent,
  authUserId: string | null,
): { reason: QuarantineReason; issues: QuarantineIssue[] } | null {
  if (event.source === "server") {
    return {
      reason: "wrong_source",
      issues: [
        {
          path: "source",
          code: "server_only",
          message: 'source "server" events are not accepted over HTTP',
        },
      ],
    };
  }
  if (event.userId !== null && event.userId !== authUserId) {
    return {
      reason: "user_mismatch",
      issues: [
        {
          path: "userId",
          code: "user_mismatch",
          message: "userId does not match the signed-in user",
        },
      ],
    };
  }
  return null;
}
