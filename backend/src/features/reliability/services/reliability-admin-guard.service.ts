import { getClerkUserPrimaryEmail } from "../../calendar/services/clerk-primary-email.service";
import { isSreAdminEmail } from "./sre-admin-allowlist.service";

export type ReliabilityAdminGuardResult =
  { ok: true; email: string } | { ok: false; reason: "no_email" | "not_admin" };

/** Mirrors calendar-sync-vip-guard.service.ts's assertCalendarSyncVip
 * shape — same 3-layer recipe (mount flag → requireUserAuth → this
 * allowlist check), reusing the Clerk email lookup that's already
 * generic (not calendar-specific despite living in that feature dir). */
export async function assertReliabilityAdminAccess(
  clerkUserId: string,
): Promise<ReliabilityAdminGuardResult> {
  const email = await getClerkUserPrimaryEmail(clerkUserId);
  if (!email) {
    return { ok: false, reason: "no_email" };
  }
  if (!isSreAdminEmail(email)) {
    return { ok: false, reason: "not_admin" };
  }
  return { ok: true, email };
}
