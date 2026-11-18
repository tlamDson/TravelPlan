import { Request, Response } from "express";
import Stripe from "stripe";
import { env } from "../../../config/env";
import { userRepository } from "../../user/repositories/user.repository";
import { logger } from "../../../lib/logger";
import { getStripe } from "../services/stripe.service";
import { resolveSubscriptionOwner } from "../services/subscription-owner.service";

const isPaymentSettled = (session: Stripe.Checkout.Session): boolean =>
  session.payment_status === "paid" ||
  session.payment_status === "no_payment_required";

export const handleStripeWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (err: any) {
    if (err?.message === "STRIPE_NOT_CONFIGURED") {
      res.status(503).json({ message: "Billing is not configured" });
      return;
    }
    throw err;
  }

  const sig = req.headers["stripe-signature"];

  if (!sig) {
    logger.warn("Stripe webhook missing signature");
    res.status(400).send("Webhook Error: Missing stripe-signature header");
    return;
  }

  let event: Stripe.Event;

  try {
    // req.body MUST be a Buffer because of express.raw() in index.ts
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err: any) {
    logger.error({ err }, "Stripe webhook signature verification failed");
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        // `completed` also fires for delayed payment methods before the money
        // has landed; only grant PRO once the payment is settled. Never
        // downgrade here: an unsettled session just leaves the tier alone.
        if (!isPaymentSettled(session)) {
          logger.info(
            {
              sessionId: session.id,
              type: event.type,
              paymentStatus: session.payment_status,
            },
            "Checkout session not paid yet; PRO not granted",
          );
          break;
        }
        // The ID of the user should be passed during checkout session creation
        const userId = session.metadata?.userId;

        if (userId) {
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
        } else {
          logger.warn(
            { sessionId: session.id },
            "Checkout session completed but missing userId in metadata",
          );
        }
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.warn(
          { sessionId: session.id },
          "Checkout async payment failed; PRO not granted",
        );
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await resolveSubscriptionOwner(subscription);

        if (userId) {
          await userRepository.updateByClerkId(userId, { tier: "free" });
          logger.info(
            { userId, subId: subscription.id },
            "User downgraded to FREE via Stripe webhook (subscription deleted)",
          );
        } else {
          logger.warn(
            { subId: subscription.id },
            "Subscription deleted but no user matches its metadata or customer",
          );
        }
        break;
      }
      default:
        logger.info(
          { type: event.type },
          "Unhandled Stripe webhook event type",
        );
    }

    res.json({ received: true });
  } catch (err: any) {
    logger.error(
      { err, type: event.type },
      "Error processing Stripe webhook event",
    );
    res.status(500).send("Internal Server Error");
  }
};
