import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import { getStripe } from "./stripe.service";
import {
  fetchCustomerEntitlements,
  fetchSubscriptionEntitlement,
} from "./stripe-subscriptions.service";

vi.mock("./stripe.service", () => ({ getStripe: vi.fn() }));

const list = vi.fn();
const retrieve = vi.fn();
const sub = (id: string, status: string) => ({
  id,
  status,
  customer: "cus_1",
  metadata: {},
});
const NOW = new Date("2026-11-17T12:00:00Z");

describe("stripe-subscriptions.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStripe).mockReturnValue({
      subscriptions: { list, retrieve },
    } as unknown as Stripe);
  });

  it("snapshots every subscription of a customer, stamped with the read time", async () => {
    list.mockResolvedValue({
      data: [
        sub("sub_live", "active"),
        sub("sub_late", "past_due"),
        sub("sub_gone", "canceled"),
        sub("sub_new", "incomplete"),
        { id: "sub_bad", status: "weird" },
      ],
    });

    const entries = await fetchCustomerEntitlements("cus_1", NOW);

    expect(list).toHaveBeenCalledWith({
      customer: "cus_1",
      status: "all",
      limit: 100,
    });
    expect(entries).toEqual([
      {
        subscriptionId: "sub_live",
        entitled: true,
        ended: false,
        eventAt: NOW,
      },
      {
        subscriptionId: "sub_late",
        entitled: false,
        ended: false,
        eventAt: NOW,
      },
      {
        subscriptionId: "sub_gone",
        entitled: false,
        ended: true,
        eventAt: NOW,
      },
    ]);
  });

  it("reads one subscription's live entitlement", async () => {
    retrieve.mockResolvedValue(sub("sub_a", "active"));

    await expect(fetchSubscriptionEntitlement("sub_a")).resolves.toEqual({
      entitled: true,
      ended: false,
    });
    expect(retrieve).toHaveBeenCalledWith("sub_a");
  });

  it("returns null for a live subscription it cannot classify", async () => {
    retrieve.mockResolvedValue(sub("sub_a", "incomplete"));
    await expect(fetchSubscriptionEntitlement("sub_a")).resolves.toBeNull();

    retrieve.mockResolvedValue({ id: "sub_a", status: "weird" });
    await expect(fetchSubscriptionEntitlement("sub_a")).resolves.toBeNull();
  });
});
