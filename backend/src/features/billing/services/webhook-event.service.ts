import type Stripe from "stripe";
import { userRepository } from "../../user/repositories/user.repository";
import { logger } from "../../../lib/logger";
import { stripeEventRepository } from "../repositories/stripe-event.repository";
import { resolveSubscriptionOwner } from "./subscription-owner.service";

/** Checkout payment states that mean the subscription is paid for. */
const PAID_CHECKOUT = new Set<Stripe.Checkout.Session.PaymentStatus>([
  "paid",
  "no_payment_required",
]);

/**
 * Subscription status → tier. `incomplete` is the brief state before the
 * first payment settles; the checkout events decide the tier then.
 */
const TIER_BY_STATUS: Record<
  Stripe.Subscription.Status,
  "pro" | "free" | null
> = {
  active: "pro",
  trialing: "pro",
  past_due: "free",
  unpaid: "free",
  paused: "free",
  canceled: "free",
  incomplete_expired: "free",
  incomplete: null,
};

async function handlePaidCheckout(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.metadata?.userId;
  if (!userId) {
    logger.warn(
      { sessionId: session.id },
      "Checkout session completed but missing userId in metadata",
    );
    return;
  }
  if (!PAID_CHECKOUT.has(session.payment_status)) {
    logger.info(
      { userId, sessionId: session.id, paymentStatus: session.payment_status },
      "Checkout session completed but not paid yet; waiting for async payment",
    );
    return;
  }
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  await userRepository.updateByClerkId(userId, {
    tier: "pro",
    ...(customerId ? { stripeCustomerId: customerId } : {}),
  });
  logger.info(
    { userId, sessionId: session.id },
    "User upgraded to PRO via Stripe webhook",
  );
}

async function applySubscriptionTier(
  subscription: Stripe.Subscription,
  tier: "pro" | "free" | null,
): Promise<void> {
  if (!tier) return;
  const userId = await resolveSubscriptionOwner(subscription);
  if (!userId) {
    logger.warn(
      { subId: subscription.id, status: subscription.status },
      "Subscription changed but no user matches its metadata or customer",
    );
    return;
  }
  await userRepository.updateByClerkId(userId, { tier });
  logger.info(
    { userId, subId: subscription.id, status: subscription.status, tier },
    "User tier set from Stripe subscription webhook",
  );
}

async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return handlePaidCheckout(event.data.object);
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      return applySubscriptionTier(
        subscription,
        TIER_BY_STATUS[subscription.status] ?? null,
      );
    }
    case "customer.subscription.deleted":
      return applySubscriptionTier(event.data.object, "free");
    default:
      logger.info({ type: event.type }, "Unhandled Stripe webhook event type");
  }
}

/**
 * Applies one verified Stripe event. An event id already handled is
 * skipped; the id is recorded only after success, so a failure stays
 * retryable by Stripe.
 */
export async function processStripeEvent(
  event: Stripe.Event,
): Promise<"processed" | "duplicate"> {
  if (await stripeEventRepository.isProcessed(event.id)) {
    logger.info(
      { eventId: event.id, type: event.type },
      "Duplicate Stripe webhook event skipped",
    );
    return "duplicate";
  }
  await dispatch(event);
  await stripeEventRepository.markProcessed(event.id, event.type);
  return "processed";
}
