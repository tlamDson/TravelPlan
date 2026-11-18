import { z } from "zod";

/** Stripe ids are [A-Za-z0-9_]; the subscription id becomes a Mongo map key. */
export const STRIPE_ID = /^[A-Za-z0-9_]+$/;

const stripeId = z.string().regex(STRIPE_ID);

/**
 * The part of a customer.subscription.updated/deleted event the tier sync
 * reads. Unknown fields pass through untouched; `status` is required on
 * `updated` (a deletion without one is treated as cancelled).
 */
export const stripeSubscriptionEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum([
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ]),
    created: z.number().int().nonnegative().optional(),
    data: z.object({
      object: z.looseObject({
        id: stripeId,
        customer: z
          .union([stripeId, z.looseObject({ id: stripeId })])
          .nullish(),
        status: z.string().min(1).optional(),
        metadata: z.record(z.string(), z.string()).nullish(),
      }),
    }),
  })
  .refine(
    (e) =>
      e.type === "customer.subscription.deleted" ||
      e.data.object.status !== undefined,
    { message: "customer.subscription.updated requires a status" },
  );

export type StripeSubscriptionEvent = z.infer<
  typeof stripeSubscriptionEventSchema
>;
