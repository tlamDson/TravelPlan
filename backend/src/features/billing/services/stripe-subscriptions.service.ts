import { logger } from "../../../lib/logger";
import { subscriptionSchema } from "../schemas/stripe-webhook.schema";
import { getStripe } from "./stripe.service";
import {
  entitlementForStatus,
  type SubscriptionEntitlement,
} from "./subscription-entitlement";

/**
 * Reads a customer's subscriptions from the Stripe API as entitlement
 * entries stamped `at`. Seeds users who became PRO before per-subscription
 * state was recorded, so their paid subscription is not missing from the
 * tier calculation. Responses are validated; unclassifiable ones are skipped.
 */
export async function fetchCustomerEntitlements(
  customerId: string,
  at: Date,
): Promise<SubscriptionEntitlement[]> {
  const page = await getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const entries: SubscriptionEntitlement[] = [];
  for (const raw of page.data) {
    const parsed = subscriptionSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn(
        { customerId, issues: parsed.error.issues },
        "Stripe subscription failed validation; skipped",
      );
      continue;
    }
    const entitlement = entitlementForStatus(parsed.data.status);
    if (entitlement) {
      entries.push({
        subscriptionId: parsed.data.id,
        ...entitlement,
        eventAt: at,
      });
    }
  }
  return entries;
}

/** One subscription's live entitlement, or null if it cannot be classified. */
export async function fetchSubscriptionEntitlement(
  subscriptionId: string,
): Promise<Pick<SubscriptionEntitlement, "entitled" | "ended"> | null> {
  const raw = await getStripe().subscriptions.retrieve(subscriptionId);
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn(
      { subscriptionId, issues: parsed.error.issues },
      "Stripe subscription failed validation; ignored",
    );
    return null;
  }
  return entitlementForStatus(parsed.data.status);
}
