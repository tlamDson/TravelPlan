import { Request, Response } from "express";
import Stripe from "stripe";
import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";
import { getStripe } from "../services/stripe.service";
import { processStripeEvent } from "../services/webhook-event.service";

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
    await processStripeEvent(event);
    res.json({ received: true });
  } catch (err: any) {
    logger.error(
      { err, type: event.type },
      "Error processing Stripe webhook event",
    );
    res.status(500).send("Internal Server Error");
  }
};
