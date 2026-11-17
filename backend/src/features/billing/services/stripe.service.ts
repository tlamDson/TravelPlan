import Stripe from "stripe";
import { env } from "../../../config/env";

let stripeClient: Stripe | null = null;

/**
 * Lazily constructs (and memoizes) the Stripe client. STRIPE_SECRET_KEY is
 * not required by envalid — billing is optional infra, not everything
 * needs it — so constructing eagerly at import time used to crash the
 * *entire* server at boot whenever the key was missing, since app.ts
 * imports billing routes unconditionally. Callers must catch
 * STRIPE_NOT_CONFIGURED and degrade (503), not let it propagate to a
 * process crash.
 */
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-01-27.acacia" as any,
    });
  }
  return stripeClient;
}

/**
 * Creates a Stripe Checkout Session for upgrading to Pro.
 */
export const createCheckoutSession = async (userId: string) => {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "TravelPlan Pro",
            description:
              "Unlimited trips, Chunked Generation, AI Recommendations",
          },
          unit_amount: 999, // $9.99/mo
          recurring: {
            interval: "month",
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId, // Required to map back to the DB upon webhook completion
    },
    // Session metadata does not carry over to the subscription; without this
    // customer.subscription.deleted cannot tell whose Pro access to revoke.
    subscription_data: {
      metadata: { userId },
    },
    success_url: `${env.FRONTEND_URL}?upgrade=success`,
    cancel_url: `${env.FRONTEND_URL}?upgrade=canceled`,
  });

  return session;
};
