import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import { syncSubscriptionTier } from "./subscription-sync.service";
import { resolveSubscriptionOwner } from "./subscription-owner.service";
import { listOtherSubscriptionStatuses } from "./customer-subscriptions.service";
import {
  userRepository,
  type StripeBillingState,
} from "../../user/repositories/user.repository";

vi.mock("./subscription-owner.service", () => ({
  resolveSubscriptionOwner: vi.fn(),
}));
vi.mock("./customer-subscriptions.service", () => ({
  listOtherSubscriptionStatuses: vi.fn(),
}));
vi.mock("../../user/repositories/user.repository", () => ({
  userRepository: {
    findStripeBillingState: vi.fn(),
    applyStripeSubscriptionEvent: vi.fn(),
  },
}));

function subEvent(
  type: "customer.subscription.updated" | "customer.subscription.deleted",
  sub: Record<string, unknown>,
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

function state(fields: Partial<StripeBillingState> = {}): StripeBillingState {
  return {
    tier: "pro",
    subscriptions: {},
    appliedEventIds: [],
    revision: 3,
    ...fields,
  };
}

const applyMock = () => vi.mocked(userRepository.applyStripeSubscriptionEvent);
const firstUpdate = () => applyMock().mock.calls[0]![2];
const liveMock = () => vi.mocked(listOtherSubscriptionStatuses);

describe("subscription-sync.service — syncSubscriptionTier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue("u1");
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue(state());
    applyMock().mockResolvedValue({ tier: "free" } as any);
    liveMock().mockResolvedValue([]);
  });

  it("downgrades on customer.subscription.updated with status paused, guarded by the read revision", async () => {
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "paused" }),
    );

    expect(applyMock()).toHaveBeenCalledWith(
      "u1",
      "evt_sub_1",
      {
        subscriptionId: "sub_A",
        customerId: "cus_1",
        status: "paused",
        eventCreated: 1_000,
        tier: "free",
      },
      3,
    );
  });

  it.each(["canceled", "unpaid", "incomplete_expired"])(
    "downgrades on customer.subscription.updated with status %s",
    async (status) => {
      await syncSubscriptionTier(
        subEvent("customer.subscription.updated", { status }),
      );

      expect(firstUpdate().tier).toBe("free");
    },
  );

  it("upgrades on active or trialing without asking Stripe about other subscriptions", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue(
      state({ tier: "free" }),
    );
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "active" }),
    );
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "trialing" }),
    );

    expect(applyMock().mock.calls.map((c) => c[2].tier)).toEqual([
      "pro",
      "pro",
    ]);
    expect(liveMock()).not.toHaveBeenCalled();
  });

  it("keeps PRO while the subscription is past_due", async () => {
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "past_due" }),
    );

    expect(firstUpdate().tier).toBe("pro");
  });

  it("treats customer.subscription.deleted as cancelled even without a status", async () => {
    await syncSubscriptionTier(subEvent("customer.subscription.deleted", {}));

    expect(firstUpdate()).toMatchObject({ status: "canceled", tier: "free" });
  });

  it("records the status but leaves the tier alone for an unclear status (incomplete)", async () => {
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "incomplete" }),
    );

    expect(firstUpdate().status).toBe("incomplete");
    expect(firstUpdate().tier).toBeUndefined();
  });

  it("keeps a legacy PRO user PRO when Stripe still has an active subscription the app never stored", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue(
      state({ stripeCustomerId: "cus_1", subscriptions: {} }),
    );
    liveMock().mockResolvedValue(["active"]);

    await syncSubscriptionTier(
      subEvent("customer.subscription.deleted", { status: "canceled" }),
    );

    expect(liveMock()).toHaveBeenCalledWith(["cus_1"], "sub_A");
    expect(firstUpdate().tier).toBe("pro");
  });

  it("asks Stripe about every customer the user is known by", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue(
      state({
        stripeCustomerId: "cus_0",
        subscriptions: {
          sub_B: { customerId: "cus_2", status: "active", eventCreated: 500 },
          sub_A: { customerId: "cus_1", status: "active", eventCreated: 500 },
        },
      }),
    );
    liveMock().mockResolvedValue(["canceled"]);

    await syncSubscriptionTier(
      subEvent("customer.subscription.deleted", { status: "canceled" }),
    );

    const [customers, excluded] = liveMock().mock.calls[0]!;
    expect([...customers].sort()).toEqual(["cus_0", "cus_1", "cus_2"]);
    expect(excluded).toBe("sub_A");
    // The stored "active" for sub_B is stale; Stripe's live answer wins.
    expect(firstUpdate().tier).toBe("free");
  });

  it("stays PRO when Stripe reports another active subscription on another customer", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue(
      state({
        subscriptions: {
          sub_B: { customerId: "cus_2", status: "active", eventCreated: 500 },
        },
      }),
    );
    liveMock().mockResolvedValue(["active"]);

    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "unpaid" }),
    );

    expect(firstUpdate().tier).toBe("pro");
  });

  it("counts a stored subscription with no customer id as stored, since Stripe cannot be asked", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue(
      state({
        subscriptions: { sub_B: { status: "trialing", eventCreated: 500 } },
      }),
    );

    await syncSubscriptionTier(
      subEvent(
        "customer.subscription.deleted",
        { status: "canceled", customer: null },
        1_000,
      ),
    );

    expect(liveMock()).not.toHaveBeenCalled();
    expect(firstUpdate().tier).toBe("pro");
  });

  it("does not write an event older than the last one applied to that subscription", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue(
      state({
        subscriptions: {
          sub_A: { customerId: "cus_1", status: "active", eventCreated: 2_000 },
        },
      }),
    );

    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "canceled" }, 1_000),
    );

    expect(applyMock()).not.toHaveBeenCalled();
  });

  it("keeps the current tier on a tie with the last applied event", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue(
      state({
        subscriptions: {
          sub_A: { customerId: "cus_1", status: "active", eventCreated: 1_000 },
        },
      }),
    );

    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "canceled" }, 1_000),
    );

    expect(applyMock()).not.toHaveBeenCalled();
  });

  it("does nothing for an event id already applied", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue(
      state({ appliedEventIds: ["evt_sub_1"] }),
    );

    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", { status: "canceled" }),
    );

    expect(applyMock()).not.toHaveBeenCalled();
  });

  it("re-reads and recomputes on fresh state when a concurrent billing write won", async () => {
    vi.mocked(userRepository.findStripeBillingState)
      .mockResolvedValueOnce(state({ stripeCustomerId: "cus_1", revision: 3 }))
      .mockResolvedValueOnce(state({ stripeCustomerId: "cus_1", revision: 4 }));
    // First read: the other subscription still looked active; by the retry
    // the concurrent cancellation of it has landed.
    liveMock()
      .mockResolvedValueOnce(["active"])
      .mockResolvedValueOnce(["canceled"]);
    applyMock()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ tier: "free" } as any);

    await syncSubscriptionTier(
      subEvent("customer.subscription.deleted", { status: "canceled" }),
    );

    expect(applyMock()).toHaveBeenCalledTimes(2);
    expect(applyMock().mock.calls[0]![3]).toBe(3);
    expect(applyMock().mock.calls[1]![3]).toBe(4);
    expect(applyMock().mock.calls[1]![2].tier).toBe("free");
  });

  it("throws (so Stripe retries) when every attempt conflicts", async () => {
    applyMock().mockResolvedValue(null);

    await expect(
      syncSubscriptionTier(
        subEvent("customer.subscription.updated", { status: "active" }),
      ),
    ).rejects.toThrow(/conflicting/);
    expect(applyMock()).toHaveBeenCalledTimes(3);
  });

  it("matches the owner by the subscription's customer (passed to the resolver)", async () => {
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", {
        status: "active",
        customer: { id: "cus_x" },
        metadata: { userId: "someone_else" },
      }),
    );

    expect(resolveSubscriptionOwner).toHaveBeenCalledWith({
      customer: "cus_x",
      metadata: { userId: "someone_else" },
    });
    expect(firstUpdate().customerId).toBe("cus_x");
  });

  it("ignores a malformed event without touching any user", async () => {
    await syncSubscriptionTier(
      subEvent("customer.subscription.updated", {
        id: "sub.$bad",
        status: "active",
      }),
    );
    await syncSubscriptionTier(subEvent("customer.subscription.updated", {}));

    expect(resolveSubscriptionOwner).not.toHaveBeenCalled();
    expect(applyMock()).not.toHaveBeenCalled();
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

  it("propagates a Stripe lookup failure so Stripe retries", async () => {
    vi.mocked(userRepository.findStripeBillingState).mockResolvedValue(
      state({ stripeCustomerId: "cus_1" }),
    );
    liveMock().mockRejectedValue(new Error("stripe down"));

    await expect(
      syncSubscriptionTier(
        subEvent("customer.subscription.deleted", { status: "canceled" }),
      ),
    ).rejects.toThrow("stripe down");
    expect(applyMock()).not.toHaveBeenCalled();
  });
});
