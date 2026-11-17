import type Stripe from "stripe";
import type { ZodType } from "zod";
import { logger } from "../../../lib/logger";
import { stripeEventRepository } from "../repositories/stripe-event.repository";
import {
  checkoutSessionSchema,
  stripeEventEnvelopeSchema,
  subscriptionSchema,
  type SubscriptionPayload,
} from "../schemas/stripe-webhook.schema";
import { syncSubscriptionEntitlement } from "./entitlement-sync.service";
import { resolveSubscriptionOwner } from "./subscription-owner.service";

type Entitlement = { entitled: boolean; ended: boolean };

/**
 * Subscription status → what it grants. `incomplete` is the brief state
 * before the first payment settles; the checkout events decide it then.
 */
const ENTITLEMENT_BY_STATUS: Record<
  SubscriptionPayload["status"],
  Entitlement | null
> = {
  active: { entitled: true, ended: false },
  trialing: { entitled: true, ended: false },
  past_due: { entitled: false, ended: false },
  unpaid: { entitled: false, ended: false },
  paused: { entitled: false, ended: false },
  canceled: { entitled: false, ended: true },
  incomplete_expired: { entitled: false, ended: true },
  incomplete: null,
};

const idOf = (ref: string | { id: string } | null | undefined) =>
  typeof ref === "string" ? ref : ref?.id;

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
  const subscriptionId = idOf(session.subscription);
  if (!subscriptionId) {
    logger.warn(
      { userId, sessionId: session.id },
      "Paid checkout session names no subscription; tier unchanged",
    );
    return;
  }
  const outcome = await syncSubscriptionEntitlement(
    userId,
    { subscriptionId, entitled: true, ended: false, eventAt },
    idOf(session.customer),
  );
  logger.info(
    { userId, sessionId: session.id, subscriptionId, outcome },
    "PRO grant from paid Stripe checkout",
  );
}

async function handleSubscription(
  event: Stripe.Event,
  eventAt: Date,
  entitlementOf: (s: SubscriptionPayload) => Entitlement | null,
): Promise<void> {
  const subscription = parsePayload(subscriptionSchema, event);
  if (!subscription) return;
  const entitlement = entitlementOf(subscription);
  if (!entitlement) return;
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
  const outcome = await syncSubscriptionEntitlement(userId, {
    subscriptionId: subscription.id,
    ...entitlement,
    eventAt,
  });
  logger.info(
    { userId, subId: subscription.id, status: subscription.status, outcome },
    "Entitlement from Stripe subscription webhook",
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
        (s) => ENTITLEMENT_BY_STATUS[s.status],
      );
    case "customer.subscription.deleted":
      return handleSubscription(event, eventAt, () => ({
        entitled: false,
        ended: true,
      }));
    default:
      logger.info({ type: event.type }, "Unhandled Stripe webhook event type");
  }
}

/**
 * Applies one verified Stripe event. Its id is recorded only after handling
 * succeeded, so a crash mid-handling leaves it for Stripe's retry; handling
 * is idempotent (per-subscription state with event-time ordering), so a
 * concurrent duplicate delivery that slips past the check is harmless.
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
  if (await stripeEventRepository.isProcessed(id)) {
    logger.info(
      { eventId: id, type },
      "Duplicate Stripe webhook event skipped",
    );
    return "duplicate";
  }
  await dispatch(event, new Date(created * 1000));
  await stripeEventRepository.markProcessed(id, type);
  return "processed";
}
