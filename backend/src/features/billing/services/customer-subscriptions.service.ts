import { getStripe } from "./stripe.service";

/** One page is far above any real count of subscriptions per customer. */
const PAGE_LIMIT = 100;

/**
 * Live statuses of every subscription of the given Stripe customers except
 * `excludeSubscriptionId`. Used before a downgrade, so a subscription this
 * app has never received an event for (legacy subscribers) still counts.
 */
export async function listOtherSubscriptionStatuses(
  customerIds: string[],
  excludeSubscriptionId: string,
): Promise<string[]> {
  const stripe = getStripe();
  const pages = await Promise.all(
    customerIds.map((customer) =>
      stripe.subscriptions.list({ customer, status: "all", limit: PAGE_LIMIT }),
    ),
  );
  return pages
    .flatMap((page) => page.data)
    .filter((sub) => sub.id !== excludeSubscriptionId)
    .map((sub) => sub.status);
}
