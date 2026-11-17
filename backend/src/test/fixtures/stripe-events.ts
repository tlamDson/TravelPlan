import type Stripe from "stripe";

/**
 * Minimal Stripe webhook event fixtures: only the fields the billing
 * webhook reads. Shapes follow the Stripe API (event.id, event.type,
 * event.data.object).
 */
export const DEFAULT_CREATED = 1_794_950_000;
let seq = 0;
const nextId = () => `evt_test_${++seq}`;

export function checkoutSessionEvent(
  type:
    "checkout.session.completed" | "checkout.session.async_payment_succeeded",
  paymentStatus: Stripe.Checkout.Session.PaymentStatus,
  overrides: {
    id?: string;
    userId?: string;
    customer?: string;
    created?: number;
  } = {},
): Stripe.Event {
  return {
    id: overrides.id ?? nextId(),
    object: "event",
    created: overrides.created ?? DEFAULT_CREATED,
    type,
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        mode: "subscription",
        payment_status: paymentStatus,
        customer: overrides.customer ?? "cus_test_1",
        metadata: { userId: overrides.userId ?? "user_1" },
      },
    },
  } as unknown as Stripe.Event;
}

export function subscriptionEvent(
  type: "customer.subscription.updated" | "customer.subscription.deleted",
  status: Stripe.Subscription.Status,
  overrides: { id?: string; created?: number } = {},
): Stripe.Event {
  return {
    id: overrides.id ?? nextId(),
    object: "event",
    created: overrides.created ?? DEFAULT_CREATED,
    type,
    data: {
      object: {
        id: "sub_test_1",
        object: "subscription",
        status,
        customer: "cus_test_1",
        metadata: { userId: "user_1" },
      },
    },
  } as unknown as Stripe.Event;
}
