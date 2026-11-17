/**
 * The PRO entitlement each Stripe subscription grants a user. The tier is
 * derived from all of them, so an event about one subscription can never
 * revoke access another subscription still pays for.
 */
export interface SubscriptionEntitlement {
  subscriptionId: string;
  /** The subscription currently pays for PRO (active/trialing, or a paid checkout). */
  entitled: boolean;
  /** Canceled or expired: a final state that no later event can re-grant. */
  ended: boolean;
  /** `created` time of the Stripe event this state came from. */
  eventAt: Date;
}

const sameState = (a: SubscriptionEntitlement, b: SubscriptionEntitlement) =>
  a.entitled === b.entitled &&
  a.ended === b.ended &&
  a.eventAt.getTime() === b.eventAt.getTime();

function supersedes(
  prev: SubscriptionEntitlement,
  next: SubscriptionEntitlement,
): boolean {
  if (prev.ended) return false;
  // An end is final, so it applies whatever order the events arrive in.
  if (next.ended) return true;
  const prevAt = prev.eventAt.getTime();
  const nextAt = next.eventAt.getTime();
  if (nextAt !== prevAt) return nextAt > prevAt;
  // Stripe's `created` has one-second resolution: on a tie the revocation
  // wins, so a same-second grant cannot undo it.
  return prev.entitled && !next.entitled;
}

/**
 * Applies one subscription's new state. Returns the new list, or null when
 * the change is stale, already applied, or would revive an ended subscription.
 */
export function applySubscriptionChange(
  entries: readonly SubscriptionEntitlement[],
  next: SubscriptionEntitlement,
): SubscriptionEntitlement[] | null {
  const index = entries.findIndex(
    (e) => e.subscriptionId === next.subscriptionId,
  );
  const prev = entries[index];
  if (!prev) return [...entries, next];
  if (sameState(prev, next) || !supersedes(prev, next)) return null;
  return entries.map((e, i) => (i === index ? next : e));
}

export function tierOf(
  entries: readonly SubscriptionEntitlement[],
): "pro" | "free" {
  return entries.some((e) => e.entitled) ? "pro" : "free";
}
