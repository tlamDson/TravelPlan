import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncSubscriptionEntitlement } from "./entitlement-sync.service";
import { userRepository } from "../../user/repositories/user.repository";
import {
  fetchCustomerEntitlements,
  fetchSubscriptionEntitlement,
} from "./stripe-subscriptions.service";

vi.mock("./stripe-subscriptions.service", () => ({
  fetchCustomerEntitlements: vi.fn(),
  fetchSubscriptionEntitlement: vi.fn(),
}));
vi.mock("../../user/repositories/user.repository", () => ({
  userRepository: {
    findStripeBillingState: vi.fn(),
    saveStripeBillingState: vi.fn(),
  },
}));

const at = (s: number) => new Date(1_794_950_000_000 + s * 1000);
const grantA = {
  subscriptionId: "sub_a",
  entitled: true,
  ended: false,
  eventAt: at(0),
};
const endA = {
  subscriptionId: "sub_a",
  entitled: false,
  ended: true,
  eventAt: at(60),
};

describe("entitlement-sync.service — syncSubscriptionEntitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userRepository.saveStripeBillingState).mockResolvedValue(true);
  });

  it("grants PRO and stores the customer id, guarded by the read revision", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "free",
      stripeBillingRev: 3,
    });

    const outcome = await syncSubscriptionEntitlement("u1", grantA, "cus_1");

    expect(outcome).toBe("applied");
    expect(userRepository.saveStripeBillingState).toHaveBeenCalledWith(
      "u1",
      3,
      { tier: "pro", stripeSubscriptions: [grantA], stripeCustomerId: "cus_1" },
    );
  });

  it("downgrades a pre-existing PRO user with no recorded subscriptions and no customer id when theirs ends", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
    });

    await syncSubscriptionEntitlement("u1", endA);

    expect(fetchCustomerEntitlements).not.toHaveBeenCalled();
    expect(userRepository.saveStripeBillingState).toHaveBeenCalledWith(
      "u1",
      undefined,
      { tier: "free", stripeSubscriptions: [endA] },
    );
  });

  it("seeds a pre-existing PRO user's subscriptions from Stripe, so another subscription ending keeps the paid one", async () => {
    const legacy = {
      subscriptionId: "sub_legacy",
      entitled: true,
      ended: false,
      eventAt: at(3600),
    };
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
      stripeCustomerId: "cus_old",
    });
    vi.mocked(fetchCustomerEntitlements).mockResolvedValue([legacy]);

    await syncSubscriptionEntitlement("u1", endA);

    expect(fetchCustomerEntitlements).toHaveBeenCalledWith(
      "cus_old",
      expect.any(Date),
    );
    expect(userRepository.saveStripeBillingState).toHaveBeenCalledWith(
      "u1",
      undefined,
      { tier: "pro", stripeSubscriptions: [legacy, endA] },
    );
  });

  it("prefers the event's customer id when seeding a pre-existing PRO user", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
      stripeCustomerId: "cus_old",
    });
    vi.mocked(fetchCustomerEntitlements).mockResolvedValue([]);

    await syncSubscriptionEntitlement("u1", grantA, "cus_evt");

    expect(fetchCustomerEntitlements).toHaveBeenCalledWith(
      "cus_evt",
      expect.any(Date),
    );
  });

  it("saves the Stripe seed even when the event itself is older than it", async () => {
    const live = { ...grantA, eventAt: at(3600) };
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
      stripeCustomerId: "cus_old",
    });
    vi.mocked(fetchCustomerEntitlements).mockResolvedValue([live]);

    const outcome = await syncSubscriptionEntitlement("u1", {
      ...grantA,
      entitled: false,
    });

    expect(outcome).toBe("applied");
    expect(userRepository.saveStripeBillingState).toHaveBeenCalledWith(
      "u1",
      undefined,
      { tier: "pro", stripeSubscriptions: [live] },
    );
  });

  it("does not ask Stripe once the user has recorded subscriptions", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
      stripeCustomerId: "cus_old",
      stripeSubscriptions: [grantA],
      stripeBillingRev: 1,
    });

    await syncSubscriptionEntitlement("u1", endA);

    expect(fetchCustomerEntitlements).not.toHaveBeenCalled();
    expect(fetchSubscriptionEntitlement).not.toHaveBeenCalled();
  });

  it("settles a same-second recovery with the subscription's live status", async () => {
    const pastDue = { ...grantA, entitled: false, eventAt: at(5) };
    const recovered = { ...grantA, eventAt: at(5) };
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "free",
      stripeSubscriptions: [pastDue],
      stripeBillingRev: 4,
    });
    vi.mocked(fetchSubscriptionEntitlement).mockResolvedValue({
      entitled: true,
      ended: false,
    });

    const outcome = await syncSubscriptionEntitlement("u1", recovered);

    expect(outcome).toBe("applied");
    expect(fetchSubscriptionEntitlement).toHaveBeenCalledWith("sub_a");
    expect(userRepository.saveStripeBillingState).toHaveBeenCalledWith(
      "u1",
      4,
      { tier: "pro", stripeSubscriptions: [recovered] },
    );
  });

  it("keeps the revocation when the live status confirms it on a same-second tie", async () => {
    const pastDue = { ...grantA, entitled: false, eventAt: at(5) };
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "free",
      stripeSubscriptions: [pastDue],
      stripeBillingRev: 4,
    });
    vi.mocked(fetchSubscriptionEntitlement).mockResolvedValue({
      entitled: false,
      ended: false,
    });

    const outcome = await syncSubscriptionEntitlement("u1", {
      ...grantA,
      eventAt: at(5),
    });

    expect(outcome).toBe("unchanged");
    expect(userRepository.saveStripeBillingState).not.toHaveBeenCalled();
  });

  it("keeps PRO when an older subscription ends while a newer one is active", async () => {
    const grantB = { ...grantA, subscriptionId: "sub_b", eventAt: at(30) };
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
      stripeSubscriptions: [grantA, grantB],
      stripeBillingRev: 2,
    });

    await syncSubscriptionEntitlement("u1", endA);

    expect(userRepository.saveStripeBillingState).toHaveBeenCalledWith(
      "u1",
      2,
      { tier: "pro", stripeSubscriptions: [endA, grantB] },
    );
  });

  it("does not write when the change is stale or already applied", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "free",
      stripeSubscriptions: [endA],
      stripeBillingRev: 1,
    });

    const outcome = await syncSubscriptionEntitlement("u1", grantA, "cus_1");

    expect(outcome).toBe("unchanged");
    expect(userRepository.saveStripeBillingState).not.toHaveBeenCalled();
  });

  it("re-reads and retries when a concurrent write changed the revision", async () => {
    vi.mocked(userRepository.findStripeBillingState)
      .mockResolvedValueOnce({ tier: "free", stripeBillingRev: 1 })
      .mockResolvedValueOnce({
        tier: "free",
        stripeSubscriptions: [endA],
        stripeBillingRev: 2,
      });
    vi.mocked(userRepository.saveStripeBillingState).mockResolvedValueOnce(
      false,
    );

    const outcome = await syncSubscriptionEntitlement("u1", grantA);

    expect(outcome).toBe("unchanged");
    expect(userRepository.findStripeBillingState).toHaveBeenCalledTimes(2);
    expect(userRepository.saveStripeBillingState).toHaveBeenCalledTimes(1);
  });

  it("throws after repeated write conflicts so the event is retried by Stripe", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "free",
      stripeBillingRev: 1,
    });
    vi.mocked(userRepository.saveStripeBillingState).mockResolvedValue(false);

    await expect(syncSubscriptionEntitlement("u1", grantA)).rejects.toThrow(
      /conflict/i,
    );
  });

  it("reports a missing user without writing", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue(null);

    const outcome = await syncSubscriptionEntitlement("u1", grantA);

    expect(outcome).toBe("user_not_found");
    expect(userRepository.saveStripeBillingState).not.toHaveBeenCalled();
  });
});
