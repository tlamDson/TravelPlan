import type Stripe from "stripe";
import { userRepository } from "../../user/repositories/user.repository";
import { logger } from "../../../lib/logger";
import { resolveSubscriptionOwner } from "./subscription-owner.service";
import { decideTier } from "./subscription-tier";

/**
 * Sync the owner's tier from a customer.subscription.updated/deleted event.
 * Events older than (or tied with) the last one applied to the same
 * subscription are ignored, so out-of-order delivery cannot flip the tier.
 */
export async function syncSubscriptionTier(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const status =
    event.type === "customer.subscription.deleted"
      ? (subscription.status ?? "canceled")
      : subscription.status;
  const eventCreated = event.created ?? 0;

  const userId = await resolveSubscriptionOwner(subscription);
  if (!userId) {
    logger.warn(
      { subId: subscription.id, type: event.type },
      "Subscription event but no user matches its metadata or customer",
    );
    return;
  }

  const state = await userRepository.findStripeBillingState(userId);
  if (!state) {
    logger.warn(
      { userId, subId: subscription.id },
      "Subscription owner has no user record",
    );
    return;
  }

  const last = state.subscriptions[subscription.id];
  if (last && eventCreated <= last.eventCreated) {
    logger.info(
      { userId, subId: subscription.id, eventId: event.id },
      "Stale subscription event ignored",
    );
    return;
  }

  const otherStatuses = Object.entries(state.subscriptions)
    .filter(([id]) => id !== subscription.id)
    .map(([, s]) => s.status);
  const tier = decideTier(status, otherStatuses);
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  const updated = await userRepository.applyStripeSubscriptionEvent(
    userId,
    event.id,
    {
      subscriptionId: subscription.id,
      ...(customerId ? { customerId } : {}),
      status,
      eventCreated,
      ...(tier ? { tier } : {}),
    },
  );

  logger.info(
    {
      userId,
      subId: subscription.id,
      status,
      tier: updated?.tier ?? state.tier,
      applied: updated !== null,
    },
    "Subscription status synced via Stripe webhook",
  );
}
