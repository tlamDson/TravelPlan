import { z } from "zod";

/**
 * The fields of a signature-verified Stripe event that the billing webhook
 * reads. A signature proves the sender, not the shape, so the payload is
 * still validated before it can change a user's tier.
 */
export const stripeEventEnvelopeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  created: z.number().int().positive(),
});

const customerSchema = z
  .union([z.string(), z.object({ id: z.string() })])
  .nullish();

const metadataSchema = z.record(z.string(), z.string()).nullish();

export const checkoutSessionSchema = z.object({
  id: z.string().min(1),
  payment_status: z.enum(["paid", "unpaid", "no_payment_required"]),
  customer: customerSchema,
  metadata: metadataSchema,
});

export const subscriptionSchema = z.object({
  id: z.string().min(1),
  status: z.enum([
    "active",
    "trialing",
    "past_due",
    "unpaid",
    "paused",
    "canceled",
    "incomplete",
    "incomplete_expired",
  ]),
  customer: customerSchema,
  metadata: metadataSchema,
});

export type CheckoutSessionPayload = z.infer<typeof checkoutSessionSchema>;
export type SubscriptionPayload = z.infer<typeof subscriptionSchema>;
