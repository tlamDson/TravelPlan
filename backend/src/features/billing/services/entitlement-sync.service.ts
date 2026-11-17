import { userRepository } from "../../user/repositories/user.repository";
import {
  applySubscriptionChange,
  tierOf,
  type SubscriptionEntitlement,
} from "./subscription-entitlement";

const MAX_ATTEMPTS = 5;

/**
 * Records one subscription's new state on the user and recomputes the tier.
 * The write is a compare-and-set on the user's billing revision, so two
 * concurrent webhook deliveries cannot interleave a stale read with a write;
 * on a conflict the state is re-read and the change re-applied. Throws after
 * repeated conflicts so the webhook answers 500 and Stripe retries.
 */
export async function syncSubscriptionEntitlement(
  clerkUserId: string,
  change: SubscriptionEntitlement,
  stripeCustomerId?: string,
): Promise<"applied" | "unchanged" | "user_not_found"> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const state = await userRepository.findStripeBillingState(clerkUserId);
    if (!state) return "user_not_found";
    const entries = applySubscriptionChange(
      state.stripeSubscriptions ?? [],
      change,
    );
    if (!entries) return "unchanged";
    const saved = await userRepository.saveStripeBillingState(
      clerkUserId,
      state.stripeBillingRev,
      {
        tier: tierOf(entries),
        stripeSubscriptions: entries,
        ...(stripeCustomerId ? { stripeCustomerId } : {}),
      },
    );
    if (saved) return "applied";
  }
  throw new Error(
    `Stripe billing state write conflict after ${MAX_ATTEMPTS} attempts`,
  );
}
