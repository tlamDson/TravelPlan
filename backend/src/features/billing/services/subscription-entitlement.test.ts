import { describe, it, expect } from "vitest";
import {
  applySubscriptionChange,
  tierOf,
  type SubscriptionEntitlement,
} from "./subscription-entitlement";

const at = (s: number) => new Date(1_794_950_000_000 + s * 1000);
const entry = (
  subscriptionId: string,
  entitled: boolean,
  s: number,
  ended = false,
): SubscriptionEntitlement => ({
  subscriptionId,
  entitled,
  ended,
  eventAt: at(s),
});

describe("subscription-entitlement — applySubscriptionChange", () => {
  it("adds the first state of a subscription", () => {
    expect(applySubscriptionChange([], entry("sub_a", true, 0))).toEqual([
      entry("sub_a", true, 0),
    ]);
  });

  it("replaces a subscription's state with a newer one", () => {
    expect(
      applySubscriptionChange([entry("sub_a", true, 0)], entry("sub_a", false, 5)),
    ).toEqual([entry("sub_a", false, 5)]);
  });

  it("ignores an older state of the same subscription (out-of-order delivery)", () => {
    expect(
      applySubscriptionChange([entry("sub_a", false, 5)], entry("sub_a", true, 0)),
    ).toBeNull();
  });

  it("lets a revocation win over a grant of the same subscription in the same second", () => {
    expect(
      applySubscriptionChange([entry("sub_a", false, 5)], entry("sub_a", true, 5)),
    ).toBeNull();
    expect(
      applySubscriptionChange([entry("sub_a", true, 5)], entry("sub_a", false, 5)),
    ).toEqual([entry("sub_a", false, 5)]);
  });

  it("never re-grants a subscription that ended, whatever the event time", () => {
    const ended = [entry("sub_a", false, 5, true)];
    expect(applySubscriptionChange(ended, entry("sub_a", true, 5))).toBeNull();
    expect(applySubscriptionChange(ended, entry("sub_a", true, 99))).toBeNull();
  });

  it("records an end even when it arrives before an older grant was processed", () => {
    expect(
      applySubscriptionChange(
        [entry("sub_a", true, 10)],
        entry("sub_a", false, 3, true),
      ),
    ).toEqual([entry("sub_a", false, 3, true)]);
  });

  it("returns null when the state is unchanged (redelivery)", () => {
    expect(
      applySubscriptionChange([entry("sub_a", true, 0)], entry("sub_a", true, 0)),
    ).toBeNull();
  });

  it("keeps other subscriptions untouched", () => {
    expect(
      applySubscriptionChange(
        [entry("sub_old", true, 0), entry("sub_new", true, 50)],
        entry("sub_old", false, 60, true),
      ),
    ).toEqual([entry("sub_old", false, 60, true), entry("sub_new", true, 50)]);
  });
});

describe("subscription-entitlement — tierOf", () => {
  it("is pro while any subscription is entitled", () => {
    expect(
      tierOf([entry("sub_old", false, 60, true), entry("sub_new", true, 50)]),
    ).toBe("pro");
  });

  it("is free when no subscription is entitled", () => {
    expect(tierOf([entry("sub_a", false, 5)])).toBe("free");
    expect(tierOf([])).toBe("free");
  });
});
