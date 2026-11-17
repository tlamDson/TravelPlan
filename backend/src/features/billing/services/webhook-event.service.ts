import type Stripe from "stripe";
import type { ZodType } from "zod";
import { userRepository } from "../../user/repositories/user.repository";
import { logger } from "../../../lib/logger";
import { stripeEventRepository } from "../repositories/stripe-event.repository";
import {
  checkoutSessionSchema,
  stripeEventEnvelopeSchema,
  subscriptionSchema,
  type CheckoutSessionPayload,
  type SubscriptionPayload,
} from "../schemas/stripe-webhook.schema";
import { resolveSubscriptionOwner } from "./subscription-owner.service";

type Tier = "pro" | "free";

/**
 * Subscription status → tier. `incomplete` is the brief state before the
 * first payment settles; the checkout events decide the tier then.
 */
const TIER_BY_STATUS: Record<SubscriptionPayload["status"], Tier | null> = {
  active: "pro",
  trialing: "pro",
  past_due: "free",
  unpaid: "free",
  paused: "free",
  canceled: "free",
  incomplete_expired: "free",
  incomplete: null,
};

const customerIdOf = (customer: CheckoutSessionPayload["customer"]) =>
  typeof customer === "string" ? customer : customer?.id;

function parsePayload<T>(schema: ZodType<T>, event: Stripe.Event): T | null {
  const parsed = schema.safeParse(event.data?.object);
  if (parsed.success) return parsed.data;
  logger.warn(
    { eventId: event.id, type: event.type, issues: parsed.error.issues },
    "Stripe webhook payload failed validation; ignored",
  );
  return null;
}

async function handlePaidCheckout(
  event: Stripe.Event,
  eventAt: Date,
): Promise<void> {
  const session = parsePayload(checkoutSessionSchema, event);
  if (!session) return;
  const userId = session.metadata?.userId;
  if (!userId) {
    logger.warn(
      { sessionId: session.id },
      "Checkout session completed but missing userId in metadata",
    );
    return;
  }
  if (session.payment_status !== "paid") {
    logger.info(
      { userId, sessionId: session.id, paymentStatus: session.payment_status },
      "Checkout session not paid; tier unchanged",
    );
    return;
  }
  const customerId = customerIdOf(session.customer);
  const user = await userRepository.setTierFromStripe(
    userId,
    { tier: "pro", ...(customerId ? { stripeCustomerId: customerId } : {}) },
    eventAt,
  );
  logger.info(
    { userId, sessionId: session.id, applied: user !== null },
    "PRO upgrade from paid Stripe checkout",
  );
}

async function handleSubscription(
  event: Stripe.Event,
  eventAt: Date,
  tierFor: (s: SubscriptionPayload) => Tier | null,
): Promise<void> {
  const subscription = parsePayload(subscriptionSchema, event);
  if (!subscription) return;
  const tier = tierFor(subscription);
  if (!tier) return;
  const userId = await resolveSubscriptionOwner(
    event.data.object as Stripe.Subscription,
  );
  if (!userId) {
    logger.warn(
      { subId: subscription.id, status: subscription.status },
      "Subscription changed but no user matches its metadata or customer",
    );
    return;
  }
  const user = await userRepository.setTierFromStripe(
    userId,
    { tier },
    eventAt,
  );
  logger.info(
    {
      userId,
      subId: subscription.id,
      status: subscription.status,
      tier,
      applied: user !== null,
    },
    "Tier from Stripe subscription webhook",
  );
}

async function dispatch(event: Stripe.Event, eventAt: Date): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return handlePaidCheckout(event, eventAt);
    case "customer.subscription.updated":
      return handleSubscription(
        event,
        eventAt,
        (s) => TIER_BY_STATUS[s.status],
      );
    case "customer.subscription.deleted":
      return handleSubscription(event, eventAt, () => "free");
    default:
      logger.info({ type: event.type }, "Unhandled Stripe webhook event type");
  }
}

/**
 * Applies one verified Stripe event at most once. The event id is claimed
 * atomically before handling and released if handling throws, so Stripe's
 * retry of a failed event is processed. Tier writes carry the event's
 * `created` time, so an older delivery never overwrites a newer state.
 */
export async function processStripeEvent(
  event: Stripe.Event,
): Promise<"processed" | "duplicate" | "invalid"> {
  const envelope = stripeEventEnvelopeSchema.safeParse(event);
  if (!envelope.success) {
    logger.warn(
      { issues: envelope.error.issues },
      "Stripe webhook event envelope failed validation; ignored",
    );
    return "invalid";
  }
  const { id, type, created } = envelope.data;
  if (!(await stripeEventRepository.claim(id, type))) {
    logger.info(
      { eventId: id, type },
      "Duplicate Stripe webhook event skipped",
    );
    return "duplicate";
  }
  try {
    await dispatch(event, new Date(created * 1000));
  } catch (err) {
    await stripeEventRepository
      .release(id)
      .catch((releaseErr: unknown) =>
        logger.error(
          { err: releaseErr, eventId: id },
          "Failed to release Stripe event claim",
        ),
      );
    throw err;
  }
  return "processed";
}
