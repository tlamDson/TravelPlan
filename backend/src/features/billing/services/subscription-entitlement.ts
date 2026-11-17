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

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "paused"
  | "canceled"
  | "incomplete"
  | "incomplete_expired";

type Entitlement = Pick<SubscriptionEntitlement, "entitled" | "ended">;

/**
 * Subscription status → what it grants. `incomplete` is the brief state
 * before the first payment settles; the checkout events decide it then.
 */
const ENTITLEMENT_BY_STATUS: Record<SubscriptionStatus, Entitlement | null> = {
  active: { entitled: true, ended: false },
  trialing: { entitled: true, ended: false },
  past_due: { entitled: false, ended: false },
  unpaid: { entitled: false, ended: false },
  paused: { entitled: false, ended: false },
  canceled: { entitled: false, ended: true },
  incomplete_expired: { entitled: false, ended: true },
  incomplete: null,
};

export const entitlementForStatus = (
  status: SubscriptionStatus,
): Entitlement | null => ENTITLEMENT_BY_STATUS[status];

const sameState = (a: SubscriptionEntitlement, b: SubscriptionEntitlement) =>
  a.entitled === b.entitled &&
  a.ended === b.ended &&
  a.eventAt.getTime() === b.eventAt.getTime();

const findEntry = (
  entries: readonly SubscriptionEntitlement[],
  subscriptionId: string,
) => entries.find((e) => e.subscriptionId === subscriptionId);

/**
 * True when `next` has the same `created` second as the stored state of a
 * live subscription but the opposite entitlement. Stripe's one-second
 * resolution cannot order such a pair (a `past_due` → `active` recovery,
 * or the reverse), so the caller settles it with the live status.
 */
export function isConflictingTie(
  entries: readonly SubscriptionEntitlement[],
  next: SubscriptionEntitlement,
): boolean {
  const prev = findEntry(entries, next.subscriptionId);
  return (
    !!prev &&
    !prev.ended &&
    !next.ended &&
    prev.eventAt.getTime() === next.eventAt.getTime() &&
    prev.entitled !== next.entitled
  );
}

function supersedes(
  prev: SubscriptionEntitlement,
  next: SubscriptionEntitlement,
  tieConfirmed: boolean,
): boolean {
  if (prev.ended) return false;
  // An end is final, so it applies whatever order the events arrive in.
  if (next.ended) return true;
  const prevAt = prev.eventAt.getTime();
  const nextAt = next.eventAt.getTime();
  if (nextAt !== prevAt) return nextAt > prevAt;
  // Same second: a state confirmed against Stripe's live status wins;
  // without it the revocation wins (fail closed).
  return tieConfirmed || (prev.entitled && !next.entitled);
}

/**
 * Applies one subscription's new state. Returns the new list, or null when
 * the change is stale, already applied, or would revive an ended subscription.
 * `tieConfirmed`: `next` was read from Stripe's live status, so it wins a
 * same-second tie.
 */
export function applySubscriptionChange(
  entries: readonly SubscriptionEntitlement[],
  next: SubscriptionEntitlement,
  { tieConfirmed = false }: { tieConfirmed?: boolean } = {},
): SubscriptionEntitlement[] | null {
  const prev = findEntry(entries, next.subscriptionId);
  if (!prev) return [...entries, next];
  if (sameState(prev, next) || !supersedes(prev, next, tieConfirmed)) {
    return null;
  }
  return entries.map((e) => (e === prev ? next : e));
}

export function tierOf(
  entries: readonly SubscriptionEntitlement[],
): "pro" | "free" {
  return entries.some((e) => e.entitled) ? "pro" : "free";
}
