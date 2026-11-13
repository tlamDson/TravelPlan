import type { AnalyticsEvent } from "@travelplan/shared";
import type { QuarantineIssue, QuarantineReason } from "./quarantine-reason";

/** simkit prefixes every simulated id (analytics/simkit/README.md). */
export const SIM_ID_PREFIX = "sim-";

/**
 * Rule of the simulated-events channel (simkit load driver), on top of the
 * schema. It plays the server's trusted path, so `source: "server"`
 * exposures are allowed, but only for simulated users: a non-null userId
 * must carry the `sim-` prefix, so a load test can never write into a real
 * user's history.
 */
export function simPolicyViolation(
  event: AnalyticsEvent,
): { reason: QuarantineReason; issues: QuarantineIssue[] } | null {
  if (event.userId !== null && !event.userId.startsWith(SIM_ID_PREFIX)) {
    return {
      reason: "user_mismatch",
      issues: [{ path: "userId", code: "not_simulated" }],
    };
  }
  return null;
}
