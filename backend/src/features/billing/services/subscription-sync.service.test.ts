import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import { syncSubscriptionTier } from "./subscription-sync.service";
import { resolveSubscriptionOwner } from "./subscription-owner.service";
import { userRepository } from "../../user/repositories/user.repository";

vi.mock("./subscription-owner.service", () => ({
  resolveSubscriptionOwner: vi.fn(),
}));
vi.mock("../../user/repositories/user.repository", () => ({
  userRepository: {
    findStripeBillingState: vi.fn(),
    applyStripeSubscriptionEvent: vi.fn(),
  },
}));

type SubFields = Partial<Stripe.Subscription>;

function subEvent(
  type: "customer.subscription.updated" | "customer.subscription.deleted",
  sub: SubFields,
  created = 1_000,
  id = "evt_sub_1",
): Stripe.Event {
  return {
    id,
    type,
    created,
    data: {
      object: { id: "sub_A", customer: "cus_1", metadata: {}, ...sub },
    },
  } as unknown as Stripe.Event;
}

const applyMock = () => vi.mocked(userRepository.applyStripeSubscriptionEvent);

describe("subscription-sync.service — syncSubscriptionTier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue("u1");
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
      subscriptions: {},
    });
    applyMock().mockResolvedValue({ tier: "free" } as any);
  });

  it("downgrades on customer.subscription.updated with status paused", async () => {
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "paused" }),
    );

    expect(applyMock()).toHaveBeenCalledWith("u1", "evt_sub_1", {
      subscriptionId: "sub_A",
      customerId: "cus_1",
      status: "paused",
      eventCreated: 1_000,
      tier: "free",
    });
  });

  it.each(["canceled", "unpaid", "incomplete_expired"])(
    "downgrades on customer.subscription.updated with status %s",
    async (status) => {
      await syncSubscriptionTier(
        subEvent("customer.subscription.updated", {
          status: status as Stripe.Subscription.Status,
        }),
      );

      expect(applyMock()).toHaveBeenCalledWith(
        "u1",
        "evt_sub_1",
        expect.objectContaining({ tier: "free" }),
      );
    },
  );

  it("upgrades on customer.subscription.updated with status active or trialing", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "free",
      subscriptions: {},
    });
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "active" }),
    );
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "trialing" }),
    );

    for (const call of applyMock().mock.calls) {
      expect(call[2].tier).toBe("pro");
    }
    expect(applyMock()).toHaveBeenCalledTimes(2);
  });

  it("keeps PRO while the subscription is past_due", async () => {
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "past_due" }),
    );

    expect(applyMock().mock.calls[0][2].tier).toBe("pro");
  });

  it("treats customer.subscription.deleted as cancelled even without a status", async () => {
    await syncSubscriptionTier(subEvent("customer.subscription.deleted", {}));

    expect(applyMock().mock.calls[0][2]).toMatchObject({
      status: "canceled",
      tier: "free",
    });
  });

  it("records the status but leaves the tier alone for an unclear status (incomplete)", async () => {
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "incomplete" }),
    );

    const update = applyMock().mock.calls[0][2];
    expect(update.status).toBe("incomplete");
    expect(update.tier).toBeUndefined();
  });

  it("stays PRO when another subscription of the user (another customer) is still active", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
      subscriptions: {
        sub_B: { customerId: "cus_2", status: "active", eventCreated: 500 },
      },
    });

    await syncSubscriptionTier(
      subEvent("customer.subscription.deleted", { status: "canceled" }),
    );

    expect(applyMock().mock.calls[0][2].tier).toBe("pro");
  });

  it("ignores the event's own earlier record when checking other subscriptions", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
      subscriptions: {
        sub_A: { customerId: "cus_1", status: "active", eventCreated: 500 },
      },
    });

    await syncSubscriptionTier(
      subEvent("customer.subscription.deleted", { status: "canceled" }),
    );

    expect(applyMock().mock.calls[0][2].tier).toBe("free");
  });

  it("downgrades once every subscription of the user is inactive", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
      subscriptions: {
        sub_B: { customerId: "cus_2", status: "canceled", eventCreated: 500 },
      },
    });

    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "unpaid" }),
    );

    expect(applyMock().mock.calls[0][2].tier).toBe("free");
  });

  it("does not write an event older than the last one applied to that subscription", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
      subscriptions: {
        sub_A: { customerId: "cus_1", status: "active", eventCreated: 2_000 },
      },
    });

    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "canceled" }, 1_000),
    );

    expect(applyMock()).not.toHaveBeenCalled();
  });

  it("keeps the current tier on a tie with the last applied event", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
      subscriptions: {
        sub_A: { customerId: "cus_1", status: "active", eventCreated: 1_000 },
      },
    });

    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "canceled" }, 1_000),
    );

    expect(applyMock()).not.toHaveBeenCalled();
  });

  it("keeps a legacy PRO user with no stored subscription id PRO", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue({
      tier: "pro",
      subscriptions: {},
    });

    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "past_due" }),
    );
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "incomplete" }),
    );
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "active" }),
    );

    const tiers = applyMock().mock.calls.map((c) => c[2].tier);
    expect(tiers).toEqual(["pro", undefined, "pro"]);
  });

  it("accepts an expanded customer object", async () => {
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", {
        status: "active",
        customer: { id: "cus_x" } as Stripe.Customer,
      }),
    );

    expect(applyMock().mock.calls[0][2].customerId).toBe("cus_x");
  });

  it("does nothing when no user owns the subscription", async () => {
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue(null);

    await syncSubscriptionTier(
      subEvent("customer.subscription.deleted", { status: "canceled" }),
    );

    expect(userRepository.findStripeBillingState).not.toHaveBeenCalled();
    expect(applyMock()).not.toHaveBeenCalled();
  });

  it("does nothing when the owner has no user record", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue(null);

    await syncSubscriptionTier(
      subEvent("customer.subscription.deleted", { status: "canceled" }),
    );

    expect(applyMock()).not.toHaveBeenCalled();
  });

  it("propagates a lookup failure so Stripe retries", async () => {
    vi.mocked(resolveSubscriptionOwner).mockRejectedValue(new Error("boom"));

    await expect(
      syncSubscriptionTier(
        subEvent("customer.subscription.deleted", { status: "canceled" }),
      ),
    ).rejects.toThrow("boom");
  });
});
