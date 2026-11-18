export type Tier = "free" | "pro";

const KEEPS_PRO = new Set(["active", "trialing", "past_due"]);
const REVOKES_PRO = new Set([
  "canceled",
  "unpaid",
  "paused",
  "incomplete_expired",
]);

/**
 * What a Stripe subscription status means for the tier. past_due keeps PRO
 * until Stripe gives up and cancels; null means the status (e.g. incomplete)
 * says nothing, so the tier is left as it is.
 */
export function entitlementOf(status: string): Tier | null {
  if (KEEPS_PRO.has(status)) return "pro";
  if (REVOKES_PRO.has(status)) return "free";
  return null;
}

/**
 * The tier after a subscription event: PRO while this or any other
 * subscription of the user keeps PRO; FREE only when this one revokes it;
 * null (no change) otherwise.
 */
export function decideTier(
  eventStatus: string,
  otherStatuses: string[],
): Tier | null {
  const own = entitlementOf(eventStatus);
  if (own === "pro") return "pro";
  if (otherStatuses.some((s) => entitlementOf(s) === "pro")) return "pro";
  return own;
}
