import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import { listOtherSubscriptionStatuses } from "./customer-subscriptions.service";
import { getStripe } from "./stripe.service";

vi.mock("./stripe.service", () => ({ getStripe: vi.fn() }));

const list = vi.fn();

describe("customer-subscriptions.service — listOtherSubscriptionStatuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStripe).mockReturnValue({
      subscriptions: { list },
    } as unknown as Stripe);
  });

  it("lists every status of every customer, except the given subscription", async () => {
    list.mockImplementation(async ({ customer }: { customer: string }) => ({
      data:
        customer === "cus_1"
          ? [
              { id: "sub_A", status: "canceled" },
              { id: "sub_B", status: "active" },
            ]
          : [{ id: "sub_C", status: "unpaid" }],
    }));

    const statuses = await listOtherSubscriptionStatuses(
      ["cus_1", "cus_2"],
      "sub_A",
    );

    expect(statuses).toEqual(["active", "unpaid"]);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1", status: "all" }),
    );
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_2", status: "all" }),
    );
  });

  it("calls Stripe not at all for no customers", async () => {
    expect(await listOtherSubscriptionStatuses([], "sub_A")).toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });

  it("propagates a Stripe failure so the webhook is retried", async () => {
    list.mockRejectedValue(new Error("stripe down"));

    await expect(
      listOtherSubscriptionStatuses(["cus_1"], "sub_A"),
    ).rejects.toThrow("stripe down");
  });
});
