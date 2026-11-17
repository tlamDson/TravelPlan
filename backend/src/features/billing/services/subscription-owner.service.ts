import type Stripe from "stripe";
import { userRepository } from "../../user/repositories/user.repository";
import { getStripe } from "./stripe.service";

/**
 * Finds the Clerk user id that owns a Stripe subscription, in order:
 * 1. subscription.metadata.userId (set via subscription_data at checkout);
 * 2. the user stored under the Stripe customer id at checkout completion;
 * 3. the customer's most recent checkout session metadata — covers
 *    subscribers who checked out before either of the above was recorded.
 * Returns null when nothing identifies the owner.
 */
export async function resolveSubscriptionOwner(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.userId;
  if (fromMetadata) return fromMetadata;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) return null;

  const user = await userRepository.findByStripeCustomerId(customerId);
  if (user) return user.clerkUserId;

  const sessions = await getStripe().checkout.sessions.list({
    customer: customerId,
    limit: 10,
  });
  const owned = sessions.data.find((s) => s.metadata?.userId);
  return owned?.metadata?.userId ?? null;
}
