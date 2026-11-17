import {
  userRepository,
  type StripeBillingState,
} from "../../user/repositories/user.repository";
import {
  fetchCustomerEntitlements,
  fetchSubscriptionEntitlement,
} from "./stripe-subscriptions.service";
import {
  applySubscriptionChange,
  isConflictingTie,
  tierOf,
  type SubscriptionEntitlement,
} from "./subscription-entitlement";

const MAX_ATTEMPTS = 5;

/**
 * The entries a change is applied to. A user who became PRO before
 * per-subscription state existed has none recorded; their subscriptions are
 * read from Stripe once, so the one that pays is not missing from the tier.
 */
async function baseEntries(
  state: StripeBillingState,
  stripeCustomerId: string | undefined,
): Promise<{ entries: SubscriptionEntitlement[]; seeded: boolean }> {
  const stored = state.stripeSubscriptions ?? [];
  const customerId = stripeCustomerId ?? state.stripeCustomerId;
  if (stored.length > 0 || state.tier !== "pro" || !customerId) {
    return { entries: stored, seeded: false };
  }
  const entries = await fetchCustomerEntitlements(customerId, new Date());
  return { entries, seeded: entries.length > 0 };
}

/**
 * A same-second pair with opposite entitlement cannot be ordered by event
 * time; the subscription's live status from Stripe decides it.
 */
async function settleTie(
  entries: readonly SubscriptionEntitlement[],
  change: SubscriptionEntitlement,
): Promise<{ change: SubscriptionEntitlement; tieConfirmed: boolean }> {
  if (!isConflictingTie(entries, change)) {
    return { change, tieConfirmed: false };
  }
  const live = await fetchSubscriptionEntitlement(change.subscriptionId);
  if (!live) return { change, tieConfirmed: false };
  return { change: { ...change, ...live }, tieConfirmed: true };
}

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
    const base = await baseEntries(state, stripeCustomerId);
    const settled = await settleTie(base.entries, change);
    const entries =
      applySubscriptionChange(base.entries, settled.change, {
        tieConfirmed: settled.tieConfirmed,
      }) ?? (base.seeded ? base.entries : null);
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
