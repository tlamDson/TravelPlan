import type Stripe from "stripe";
import {
  userRepository,
  type StripeBillingState,
} from "../../user/repositories/user.repository";
import { logger } from "../../../lib/logger";
import { resolveSubscriptionOwner } from "./subscription-owner.service";
import { listOtherSubscriptionStatuses } from "./customer-subscriptions.service";
import { decideTier, entitlementOf, type Tier } from "./subscription-tier";
import {
  stripeSubscriptionEventSchema,
  type StripeSubscriptionEvent,
} from "../schemas/stripe-subscription-event.schema";

/** Re-reads after a concurrent billing write before giving up (→ 500, Stripe retries). */
const MAX_ATTEMPTS = 3;

type Subscription = StripeSubscriptionEvent["data"]["object"];

const customerIdOf = (sub: Subscription): string | undefined =>
  typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

/**
 * Statuses of the user's other subscriptions. Read live from Stripe for every
 * customer the user is known by, so a subscription this app never got an
 * event for (legacy subscribers) still keeps PRO; stored entries without a
 * customer id cannot be looked up and are taken as stored.
 */
async function otherStatuses(
  state: StripeBillingState,
  sub: Subscription,
): Promise<string[]> {
  const customers = new Set<string>();
  const eventCustomer = customerIdOf(sub);
  if (eventCustomer) customers.add(eventCustomer);
  if (state.stripeCustomerId) customers.add(state.stripeCustomerId);
  const unreachable: string[] = [];
  for (const [id, entry] of Object.entries(state.subscriptions)) {
    if (id === sub.id) continue;
    if (entry.customerId) customers.add(entry.customerId);
    else unreachable.push(entry.status);
  }
  const live = customers.size
    ? await listOtherSubscriptionStatuses([...customers], sub.id)
    : [];
  return [...live, ...unreachable];
}

async function tierAfter(
  state: StripeBillingState,
  sub: Subscription,
  status: string,
): Promise<Tier | null> {
  // Only a status that does not itself keep PRO needs the other subscriptions.
  if (entitlementOf(status) === "pro") return "pro";
  return decideTier(status, await otherStatuses(state, sub));
}

/**
 * Sync the owner's tier from a customer.subscription.updated/deleted event.
 * Events older than (or tied with) the last one applied to the same
 * subscription are ignored, so out-of-order delivery cannot flip the tier.
 * The write is conditional on the billing revision read, so concurrent events
 * for the same user are applied one after another on fresh state.
 */
export async function syncSubscriptionTier(event: Stripe.Event): Promise<void> {
  const parsed = stripeSubscriptionEventSchema.safeParse(event);
  if (!parsed.success) {
    logger.warn(
      { eventId: event.id, type: event.type, issues: parsed.error.issues },
      "Malformed Stripe subscription event ignored",
    );
    return;
  }
  const { data, created = 0, id: eventId, type } = parsed.data;
  const sub = data.object;
  const status =
    type === "customer.subscription.deleted"
      ? (sub.status ?? "canceled")
      : sub.status!;

  const userId = await resolveSubscriptionOwner({
    customer: customerIdOf(sub) ?? null,
    metadata: sub.metadata ?? {},
  } as Pick<Stripe.Subscription, "customer" | "metadata">);
  if (!userId) {
    logger.warn(
      { subId: sub.id, type },
      "Subscription event but no user matches its customer or metadata",
    );
    return;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const state = await userRepository.findStripeBillingState(userId);
    if (!state) {
      logger.warn(
        { userId, subId: sub.id },
        "Subscription owner has no user record",
      );
      return;
    }
    if (state.appliedEventIds.includes(eventId)) return;
    const last = state.subscriptions[sub.id];
    if (last && created <= last.eventCreated) {
      logger.info(
        { userId, subId: sub.id, eventId },
        "Stale subscription event ignored",
      );
      return;
    }

    const tier = await tierAfter(state, sub, status);
    const customerId = customerIdOf(sub);
    const updated = await userRepository.applyStripeSubscriptionEvent(
      userId,
      eventId,
      {
        subscriptionId: sub.id,
        ...(customerId ? { customerId } : {}),
        status,
        eventCreated: created,
        ...(tier ? { tier } : {}),
      },
      state.revision,
    );
    if (updated) {
      logger.info(
        { userId, subId: sub.id, status, tier: updated.tier },
        "Subscription status synced via Stripe webhook",
      );
      return;
    }
  }
  throw new Error(
    `Stripe subscription sync for ${userId} kept conflicting; leaving it to Stripe's retry`,
  );
}
